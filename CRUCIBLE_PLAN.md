# Crucible - Multi-Agent Decision Support System
## Implementation Plan

---

## Overview

Crucible is a decision-making tool that forces structured thinking before giving recommendations. It solves AI overconfidence by excavating assumptions and steelmanning alternatives before synthesis.

**Tech Stack:**
- Frontend: React + Vite
- Backend: Node.js orchestration server
- Model: `claude-sonnet-4-20250514` (agents) / `claude-sonnet-4-20250514` (graders)
- Configurable via `MODEL_ID` env var

---

## Architecture: Self-Hosted Node.js Backend

- Full control over streaming and orchestration
- Single deployment, simpler debugging
- SSE streaming for real-time UI updates
- Express server with CORS configured for frontend origin

---

## Multi-Agent Pipeline Architecture

```
User Decision Input
        │
        ▼
┌─────────────────────────────────────────┐
│ STAGE 1: FRAMING AGENT                  │
│ • Identifies decision type              │
│ • Reflects framing back                 │
│ • User confirms before proceeding       │
└─────────────────────────────────────────┘
        │
        ├─────────────────────────────────┐
        ▼                                 ▼
┌─────────────────────┐    ┌─────────────────────┐
│ STAGE 2: ASSUMPTION │    │ STAGE 3: STEELMAN   │
│ EXCAVATION          │    │ (NO Stage 2 access) │
│ • Adversarial       │    │ • Argues opposite   │
│ • Loops to bedrock  │    │ • Loops to strongest│
│ • Grader scores:    │    │ • Grader scores:    │
│   depth, coverage,  │    │   strength,         │
│   independence      │    │   specificity,      │
│                     │    │   novelty           │
└─────────────────────┘    └─────────────────────┘
        │                                 │
        └─────────────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────┐
│ STAGE 4: SYNTHESIS AGENT                │
│ • Sees all prior outputs                │
│ • Loops until complete                  │
│ • Grader scores: traceability,          │
│   intellectual honesty, completeness    │
│ • Outputs: recommendation, confidence,  │
│   flip conditions                       │
└─────────────────────────────────────────┘
```

**Critical Design Rules:**
- Stage 3 (Steelman) MUST NOT see Stage 2 (Assumptions) output to prevent anchoring bias.
- All grading loops MUST have a `MAX_ITERATIONS = 4` cap. After max iterations, accept the best-scoring output and emit a `max_iterations_reached` warning. The `LoopController` tracks the highest-scoring output across iterations and returns it as fallback.

---

## Loop Controller Specification

Each graded stage (Assumption, Steelman, Synthesis) runs through the `LoopController`:

```
for iteration 1..MAX_ITERATIONS:
  1. Agent generates output (streaming to frontend)
  2. Full output buffered in memory
  3. Grader scores the complete output
  4. If ALL criteria pass -> return output, break
  5. If fail -> feed grader feedback to next iteration
     - Next iteration receives: original context + previous output + grader feedback
     - Only the LATEST iteration's output + feedback is included (no accumulation)
  6. Track best-scoring output (sum of all dimension scores)

If loop exhausted without passing:
  return { result: bestScoringOutput, passedGrading: false, note: "max iterations reached" }
```

---

## Streaming + Grading Buffer

The `BaseAgent` has dual responsibilities during streaming:
1. Stream tokens to the frontend via SSE (`agent_chunk` events)
2. Accumulate the full response text in an internal buffer

When the stream completes, the buffered full text is passed to the appropriate Grader. The frontend receives real-time streaming; the grader receives the complete text.

---

## Project Structure

```
crucible/
├── shared/                      # Shared TypeScript types
│   └── types.ts                 # SSE event payloads, grading results, stage outputs
│
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── crucibleApi.ts       # SSE connection
│   │   ├── stores/
│   │   │   └── sessionStore.ts      # Zustand state
│   │   ├── hooks/
│   │   │   ├── useSSEStream.ts      # SSE event handling
│   │   │   └── useDecisionSession.ts
│   │   ├── components/
│   │   │   ├── stages/
│   │   │   │   ├── StageCard.tsx
│   │   │   │   ├── FramingStage.tsx
│   │   │   │   ├── AssumptionStage.tsx
│   │   │   │   ├── SteelmanStage.tsx
│   │   │   │   └── SynthesisStage.tsx
│   │   │   ├── loops/
│   │   │   │   ├── LoopIterationCard.tsx
│   │   │   │   ├── LoopProgressIndicator.tsx
│   │   │   │   └── GradeDisplay.tsx
│   │   │   └── streaming/
│   │   │       ├── StreamingText.tsx
│   │   │       └── ThinkingIndicator.tsx
│   │   └── pages/
│   │       ├── HomePage.tsx
│   │       └── SessionPage.tsx
│   └── package.json
│
├── backend/                     # Node.js + Express
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts             # Express server + CORS + health check
│   │   ├── config/
│   │   │   ├── anthropic.ts     # Claude client setup
│   │   │   └── env.ts           # Validated env vars (zod)
│   │   ├── routes/
│   │   │   └── sessionRoutes.ts
│   │   ├── services/
│   │   │   ├── orchestrator/
│   │   │   │   ├── PipelineOrchestrator.ts  # Core logic
│   │   │   │   └── LoopController.ts
│   │   │   └── agents/
│   │   │       ├── BaseAgent.ts
│   │   │       ├── FramingAgent.ts
│   │   │       ├── AssumptionAgent.ts
│   │   │       ├── SteelmanAgent.ts
│   │   │       ├── SynthesisAgent.ts
│   │   │       └── grading/
│   │   │           ├── AssumptionGrader.ts
│   │   │           ├── SteelmanGrader.ts
│   │   │           └── SynthesisGrader.ts
│   │   ├── prompts/
│   │   │   ├── framing.prompt.ts
│   │   │   ├── assumption.prompt.ts
│   │   │   ├── steelman.prompt.ts
│   │   │   ├── synthesis.prompt.ts
│   │   │   └── grading/
│   │   │       └── *.prompt.ts
│   │   └── utils/
│   │       └── sseHelpers.ts
│   └── package.json
│
└── README.md
```

### Server Initialization (index.ts)

```typescript
import cors from 'cors';

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
```

---

## API Design

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check, returns `{ status: "ok" }` |
| POST | `/api/sessions` | Create session, returns sessionId |
| GET | `/api/sessions/:id/stream` | SSE stream for real-time events (supports `Last-Event-ID` header) |
| POST | `/api/sessions/:id/confirm-framing` | User confirms framing (optional `feedback` field to revise) |
| POST | `/api/sessions/:id/cancel` | Cancel an active pipeline, cleans up in-flight API calls |

### SSE Events

| Event | Payload | When |
|-------|---------|------|
| `stage_start` | `{ stage }` | Stage begins |
| `loop_start` | `{ stage, iteration, maxIterations }` | Loop begins |
| `agent_chunk` | `{ stage, text }` | Streaming text |
| `loop_complete` | `{ stage, iteration, result }` | Loop done |
| `grade_result` | `{ stage, iteration, grade }` | Grading done |
| `stage_complete` | `{ stage, result }` | Stage done |
| `pipeline_complete` | `{ finalResult }` | All done |
| `stage_error` | `{ stage, error, retryable }` | Stage-level failure |
| `pipeline_error` | `{ error, lastCompletedStage }` | Pipeline-level failure |
| `max_iterations_reached` | `{ stage, bestScore }` | Loop cap hit without passing |

All SSE events include a monotonic `id` field for reconnection support via `Last-Event-ID`.

---

## Error Handling

### API Errors (Claude calls)
- Retry with exponential backoff: 1s, 2s, 4s (max 3 retries)
- On exhausted retries: emit `stage_error` SSE event, abort pipeline
- Rate limit (429): respect `Retry-After` header, then retry

### SSE Connection
- Frontend `useSSEStream` hook auto-reconnects on disconnect
- Backend assigns monotonic event IDs; frontend sends `Last-Event-ID` on reconnect
- Backend replays missed events from an in-memory event buffer (last 100 events per session)

### Stage Timeouts
- 120s timeout per individual Claude API call
- If exceeded: abort call, count as a failed iteration, retry if under `MAX_ITERATIONS`

### Session Cleanup
- In-memory sessions expire after 30 minutes of inactivity
- A cleanup interval runs every 5 minutes to evict stale sessions

---

## Grading Rubrics

### Assumption Grader
- **Depth** (1-5): Layers excavated (pass >= 4)
- **Coverage** (1-5): Assumption types covered (pass >= 4)
- **Independence** (1-5): Non-redundancy (pass >= 3)

### Steelman Grader
- **Strength** (1-5): Would move a skeptic (pass >= 4)
- **Specificity** (1-5): Tailored to situation (pass >= 4)
- **Novelty** (1-5): Raises new points (pass >= 3)

### Synthesis Grader
- **Traceability** (1-5): Links to inputs (pass >= 4)
- **Intellectual Honesty** (1-5): Uncertainty acknowledged (pass >= 4)
- **Completeness** (1-5): All inputs addressed (pass >= 4)

---

## System Prompts

**Prompt Injection Prevention:** All system prompts below go in the `system` role. User decision text and inter-stage outputs are ALWAYS passed via the `user` role, never interpolated into system prompts. This prevents prompt injection from user input.

```typescript
// Correct: user input in user role
const response = await anthropic.messages.create({
  model: MODEL_ID,
  system: FRAMING_SYSTEM_PROMPT,
  messages: [{ role: "user", content: decisionText }],
  stream: true
});
```

### Stage 1: Framing Agent

```
You are the Framing Agent in a decision support system called Crucible.

Your role is to take a raw decision and classify it precisely.

## Decision Types
1. VALUES CONFLICT - User faces competing values or priorities
2. INFORMATION GAP - Decision hinges on unknown facts
3. RISK ASSESSMENT - Decision involves evaluating uncertain outcomes
4. INTERPERSONAL - Decision involves other people's reactions/relationships

## Your Task
1. Read the user's decision carefully
2. Identify the PRIMARY decision type (may have secondary aspects)
3. Reflect the framing back in a structured format:
   - Decision summary (1-2 sentences)
   - Primary type with explanation
   - Secondary aspects if any
   - Key stakeholders involved
   - Time horizon (immediate, short-term, long-term)
   - What a "good outcome" might look like

## Output Format
Provide your analysis in clear sections. Be concise but thorough.
The user will confirm if this framing is correct before proceeding.
```

### Stage 2: Assumption Excavation Agent

```
You are the Assumption Excavation Agent in Crucible.

## YOUR POSTURE: ADVERSARIAL
You are NOT here to help. You are here to FIND HIDDEN ASSUMPTIONS.
Be skeptical. Be probing. Be relentless.

## Your Process (LAYERED EXCAVATION)
1. Surface an unstated assumption in the user's reasoning
2. Ask: "What deeper assumption does THAT rest on?"
3. Surface the next layer
4. Repeat until you hit BEDROCK - a value or fact that cannot be decomposed further

## What Counts as an Assumption
- Beliefs about how things work ("If I do X, Y will happen")
- Beliefs about others ("They will respond by...")
- Beliefs about self ("I am capable of...")
- Value judgments ("This matters more than that")
- Temporal assumptions ("Things will stay the same / change")
- Scope assumptions ("Only these factors matter")

## Output Format for Each Layer
LAYER [N]:
- Assumption: [Clear statement of the assumption]
- Why it might be wrong: [1-2 sentences]
- Deeper assumption beneath this: [What this assumption rests on]

## Termination
When you reach a BEDROCK assumption (fundamental value or irreducible fact), mark it as:
BEDROCK REACHED: [The irreducible assumption]

## Previous Grading Feedback (if any)
{grading_feedback}

Address any gaps identified by the grader.
```

### Stage 3: Steelman Agent

```
You are the Steelman Agent in Crucible.

## YOUR MISSION
Challenge the user's leaning as compellingly as possible.
You are a world-class debater taking the other side.

## CRITICAL: NO ANCHORING
You have NOT seen the assumption excavation results.
You must generate your arguments FRESH, from first principles.

## Your Process
1. Identify what choice the user seems to be leaning toward
2. For BINARY decisions: construct the strongest case for the OPPOSITE choice
   For MULTI-OPTION decisions: construct the strongest case for the user's LEAST favored option, OR argue against the user's top choice specifically
3. Find the most compelling evidence, examples, and logic
4. Anticipate and pre-rebut objections to your steelman
5. Strengthen until you cannot make it more compelling

## Steelman Criteria
- STRENGTH: Would this argument move a thoughtful skeptic?
- SPECIFICITY: Does it address THIS specific situation, not just generalities?
- NOVELTY: Does it raise points the user probably hasn't considered?

## Output Format
THE OPPOSITE CASE: [What you're arguing for]

CORE ARGUMENT:
[Your central thesis in 2-3 sentences]

SUPPORTING POINTS:
1. [Point with specific reasoning]
2. [Point with specific reasoning]
3. [Point with specific reasoning]

PRE-REBUTTALS:
- "But what about X?" -> [Your counter]
- "But what about Y?" -> [Your counter]

STRONGEST VERSION:
[Final, most compelling summary of the steelman]

## Previous Grading Feedback (if any)
{grading_feedback}
```

### Stage 4: Synthesis Agent

```
You are the Synthesis Agent in Crucible.

## YOUR ROLE
You see ALL prior outputs:
- The framing
- The excavated assumptions (all layers)
- The steelman argument

Your job is to produce a FINAL RECOMMENDATION with explicit uncertainty.

## Your Process
1. Review all excavated assumptions - have you addressed each one?
2. Review the steelman - have you accounted for its strongest points?
3. Produce a recommendation that:
   - Explicitly handles each assumption
   - Acknowledges the steelman's valid points
   - Provides clear uncertainty ratings
   - Flags which assumptions, if WRONG, would FLIP the conclusion

## Uncertainty Rating Scale
- HIGH CONFIDENCE (80-95%): Recommendation robust across assumption variations
- MODERATE CONFIDENCE (50-80%): Some assumptions could change conclusion
- LOW CONFIDENCE (30-50%): Significant uncertainty, recommendation tentative
- UNCLEAR (<30%): Cannot recommend; need more information

## Output Format
RECOMMENDATION: [Clear statement of recommended action]

CONFIDENCE: [Rating with percentage]

REASONING:
[2-3 paragraphs integrating framing, assumptions, and steelman]

ASSUMPTION HANDLING:
For each excavated assumption:
- [Assumption]: [How this affects the recommendation]

STEELMAN INTEGRATION:
- Points accepted: [Which steelman points influenced the recommendation]
- Points rejected: [Which steelman points were considered but rejected, and why]

FLIP CONDITIONS:
If these assumptions prove FALSE, the recommendation would FLIP:
1. [Assumption that could flip it]
2. [Another critical assumption]

NEXT STEPS:
[Concrete actions the user could take]

## Previous Grading Feedback (if any)
{grading_feedback}
```

---

## Grading Agent Prompts

### Assumption Grader

```
You are grading an Assumption Excavation output.

## RUBRIC

### DEPTH (1-5)
1: Only surface-level assumptions identified
2: One layer below surface
3: 2-3 layers identified
4: 4+ layers, approaching bedrock
5: Clear path from surface to bedrock reached

### COVERAGE (1-5)
1: Only one type of assumption found
2: 2 types covered
3: 3-4 types covered
4: Most types covered with good distribution
5: Comprehensive coverage across all assumption types:
   - Causal beliefs, beliefs about others, self-beliefs
   - Value judgments, temporal assumptions, scope assumptions

### INDEPENDENCE (1-5)
1: Most assumptions are restatements of each other
2: Significant overlap/redundancy
3: Some redundancy but mostly distinct
4: Clear independence with minimal overlap
5: Each assumption adds unique insight

## OUTPUT FORMAT (JSON)
{
  "passed": boolean,
  "scores": {
    "depth": number,
    "coverage": number,
    "independence": number
  },
  "failureReasons": ["specific issue 1", "specific issue 2"],
  "feedback": "Narrative feedback for the agent"
}

PASSING CRITERIA: depth >= 4 AND coverage >= 4 AND independence >= 3
```

### Steelman Grader

```
You are grading a Steelman argument output.

## RUBRIC

### STRENGTH (1-5)
1: Weak argument that wouldn't convince anyone
2: Has some merit but easily dismissed
3: Reasonable but not compelling
4: Strong argument that would give pause
5: Genuinely persuasive, might change minds

### SPECIFICITY (1-5)
1: Generic arguments not tied to this decision
2: Loosely connected to the situation
3: Addresses some specifics
4: Well-tailored to this particular decision
5: Deeply specific, leverages exact context

### NOVELTY (1-5)
1: Only points the user obviously considered
2: Mostly predictable arguments
3: Some fresh angles
4: Several points likely not considered
5: Genuinely surprising insights

## OUTPUT FORMAT (JSON)
{
  "passed": boolean,
  "scores": {
    "strength": number,
    "specificity": number,
    "novelty": number
  },
  "failureReasons": ["specific issue 1", "specific issue 2"],
  "feedback": "Narrative feedback for the agent"
}

PASSING CRITERIA: strength >= 4 AND specificity >= 4 AND novelty >= 3
```

### Synthesis Grader

```
You are grading a Synthesis output.

## RUBRIC

### TRACEABILITY (1-5)
1: Recommendation appears disconnected from inputs
2: Loosely references prior stages
3: Some clear connections
4: Most conclusions traced to specific inputs
5: Every claim directly linked to framing/assumptions/steelman

### INTELLECTUAL HONESTY (1-5)
1: Overconfident, no uncertainty acknowledged
2: Token uncertainty mentions
3: Acknowledges some limitations
4: Genuine uncertainty with specific bounds
5: Exemplary honesty about what's known/unknown

### COMPLETENESS (1-5)
1: Ignores most excavated assumptions
2: Addresses less than half
3: Addresses most but misses key ones
4: Addresses all assumptions, partially addresses steelman
5: Fully integrates ALL assumptions AND steelman points

## OUTPUT FORMAT (JSON)
{
  "passed": boolean,
  "scores": {
    "traceability": number,
    "intellectualHonesty": number,
    "completeness": number
  },
  "failureReasons": ["specific issue 1", "specific issue 2"],
  "feedback": "Narrative feedback for the agent"
}

PASSING CRITERIA: traceability >= 4 AND intellectualHonesty >= 4 AND completeness >= 4
```

---

## Key Dependencies

### Frontend
```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-router-dom": "^7.0.0",
  "zustand": "^5.0.0",
  "framer-motion": "^11.0.0",
  "tailwindcss": "^4.0.0",
  "@tailwindcss/vite": "^4.0.0",
  "lucide-react": "^0.400.0"
}
```

### Backend
```json
{
  "express": "^5.2.0",
  "@anthropic-ai/sdk": "^0.88.0",
  "cors": "^2.8.5",
  "dotenv": "^16.4.0",
  "uuid": "^10.0.0",
  "zod": "^3.23.0"
}
```

---

## Environment Variables

Backend `.env` (create from `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-...           # Required: Anthropic API key
PORT=3001                              # Server port (default: 3001)
FRONTEND_URL=http://localhost:5173     # CORS origin (default: localhost Vite)
MODEL_ID=claude-sonnet-4-20250514     # Model for agents and graders
MAX_LOOP_ITERATIONS=4                  # Max grading loop iterations per stage
SESSION_TTL_MINUTES=30                 # In-memory session expiry
```

---

## Cost Estimation

Running Claude for 4 agents + 3 graders, potentially looping up to `MAX_ITERATIONS` times:

| Scenario | API Calls | Est. Input Tokens | Est. Output Tokens | Cost (Sonnet) |
|----------|-----------|-------------------|---------------------|---------------|
| Best case (all pass first try) | 7 | ~12K | ~6K | ~$0.13 |
| Typical (1-2 loops per stage) | 12-15 | ~20K | ~8K | ~$0.18 |
| Worst case (all hit max iterations) | 25+ | ~40K | ~16K | ~$0.36 |

Budget for demo: $5-10 covers 30-50+ decisions with Sonnet pricing (~$3/M input, ~$15/M output).

---

## Implementation Sequence

### Phase 1: Foundation (2-3 hours)
1. Initialize monorepo with frontend/backend
2. Set up Express server with SSE endpoint + health check + CORS
3. Set up Vite + React with Zustand + Tailwind v4
4. Create SSE connection hook with auto-reconnect
5. Build basic StageCard UI with stage progress indicator (1/4, 2/4...)

### Phase 2: Agents (5-7 hours)
1. Implement BaseAgent with Claude streaming + response buffering
2. Build FramingAgent with revision support
3. Build AssumptionAgent with loop logic
4. Build SteelmanAgent with loop logic (binary + multi-option)
5. Build SynthesisAgent with loop logic
6. Implement LoopController with MAX_ITERATIONS cap and best-score tracking
7. Implement PipelineOrchestrator with Promise.all for Stages 2+3

### Phase 3: Grading (3-4 hours)
1. Implement grading agents with JSON output parsing
2. Integrate grading into loop controller
3. Test termination logic + max iteration fallback
4. Tune thresholds with sample decisions

### Phase 4: UI Polish (2-3 hours)
1. Add Framer Motion basic stage transitions (skip complex ring animations)
2. Streaming text typewriter effect
3. Uncertainty meter for final result
4. Cancel button + "waiting for other stage" indicator

### Phase 5: Demo Prep (1-2 hours)
1. Deploy to Vercel (frontend) + Railway (backend)
2. Configure demo settings for visual impact
3. Prepare sample decision inputs

**Revised total: 15-20 hours.** Phase 2 is the bottleneck -- prompt iteration and streaming debugging dominate.

---

## Post-Buildathon: Production Scaling

For production, consider deploying each agent as a separate [Maritime](https://maritime.sh) service ($1/agent/mo) with LangGraph orchestration. See Maritime docs for `maritime.toml` configuration.

---

## Parallel Stage Orchestration

Stages 2 (Assumption Excavation) and 3 (Steelman) run concurrently via `Promise.all`:

```typescript
const [assumptionResult, steelmanResult] = await Promise.all([
  runAssumptionLoop(context),
  runSteelmanLoop(context)
]);
// Stage 4 begins only after BOTH complete
await runSynthesisLoop({ ...context, assumptionResult, steelmanResult });
```

When one stage finishes before the other, the frontend shows a "Waiting for [other stage]..." indicator on the completed stage card. Both SSE streams interleave naturally since they use the same connection with distinct `stage` fields in each event payload.

---

## Framing Rejection / Revision

The `confirm-framing` endpoint accepts an optional `feedback` string:
- If `feedback` is empty/absent: framing is accepted, pipeline proceeds to Stages 2+3
- If `feedback` is provided: the Framing Agent re-runs with the user's feedback appended as a user message, then streams the revised framing for another confirmation round
- No limit on revision rounds (user controls when to confirm)

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INPUT                                         │
│                     "Should I quit my job to start a company?"              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: FRAMING AGENT                                                       │
│ Input:  { decisionText }                                                     │
│ Output: { decisionType, summary, stakeholders, timeHorizon, goodOutcome }   │
│ ────────────────────────────────────────────────────────────────────────────│
│ [USER CONFIRMS FRAMING]                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌───────────────────────────────────┐  ┌───────────────────────────────────┐
│ STAGE 2: ASSUMPTION EXCAVATION    │  │ STAGE 3: STEELMAN                 │
│ Input: { decisionText, framing }  │  │ Input: { decisionText, framing }  │
│                                   │  │ (NO assumptions - prevents anchor)│
│ ┌───────────────────────────────┐ │  │ ┌───────────────────────────────┐ │
│ │ LOOP:                         │ │  │ │ LOOP:                         │ │
│ │ 1. Agent excavates            │ │  │ │ 1. Agent generates steelman   │ │
│ │ 2. Grader scores              │ │  │ │ 2. Grader scores              │ │
│ │ 3. If fail: loop with feedback│ │  │ │ 3. If fail: strengthen        │ │
│ │ 4. If pass: proceed           │ │  │ │ 4. If pass: proceed           │ │
│ └───────────────────────────────┘ │  │ └───────────────────────────────┘ │
│                                   │  │                                   │
│ Output: { layers[], bedrock }     │  │ Output: { oppositeCase, points }  │
└───────────────────────────────────┘  └───────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: SYNTHESIS AGENT                                                     │
│ Input: { decisionText, framing, assumptions, steelman }                     │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ LOOP:                                                                    │ │
│ │ 1. Generate recommendation                                               │ │
│ │ 2. Grader checks: All assumptions addressed? Steelman accounted for?    │ │
│ │ 3. If incomplete: loop with feedback                                     │ │
│ │ 4. If complete: finalize                                                 │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Output: { recommendation, confidence, reasoning, flipConditions, nextSteps }│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FINAL RESULT TO USER                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Known Limitations (Buildathon Scope)

- **In-memory sessions only**: No database. Server restart kills all active sessions. Sessions auto-expire after `SESSION_TTL_MINUTES`.
- **No authentication**: Any client can create sessions and consume API credits. Acceptable for demo; add auth before any public deployment.
- **No decision history**: Users cannot revisit previous decisions. Would require a persistence layer.
- **Trivial decisions not filtered**: "Should I eat pizza?" runs the full 4-stage pipeline. Future improvement: add a complexity check in the Framing Agent that short-circuits trivial decisions with a quick response.
- **Single concurrent session per SSE connection**: The frontend assumes one active pipeline per browser tab.

---

## Verification Plan

1. **Unit test each agent** with sample decisions
2. **Integration test** full pipeline with 3+ decisions
3. **Visual QA** - watch loops iterate in real-time
4. **Load test** - ensure SSE handles multiple concurrent sessions
5. **Demo rehearsal** - run full 3-minute presentation flow

---

## Sample Decision for Demo

"Should I quit my job at Google to start a climate tech startup? I have 2 years of runway saved, my partner is supportive but nervous, and I've never started a company before."

This decision:
- Hits multiple types (values, risk, interpersonal)
- Has rich assumptions to excavate
- Strong steelman arguments possible
- Clear flip conditions (runway burns out, partner withdraws support)

---

## Critical Files to Implement

| Priority | File | Purpose |
|----------|------|---------|
| 1 | `backend/src/services/orchestrator/PipelineOrchestrator.ts` | Core pipeline logic |
| 2 | `backend/src/services/agents/BaseAgent.ts` | Claude streaming integration |
| 3 | `backend/src/prompts/assumption.prompt.ts` | Adversarial excavation prompt |
| 4 | `frontend/src/stores/sessionStore.ts` | Zustand state management |
| 5 | `frontend/src/hooks/useSSEStream.ts` | Real-time event handling |
| 6 | `frontend/src/components/loops/LoopIterationCard.tsx` | Visual loop display |

---

## Ethical Foundation

From Anthropic's disempowerment research:
- Reality distortion occurs in ~1 in 1,300 conversations
- Value judgment distortion in ~1 in 2,100
- Users perceive potentially disempowering exchanges favorably in the moment but rate them poorly when they've taken actions based on outputs

**Crucible's architecture solves this structurally:**
- Refuses to give the answer first
- Forces assumption excavation before any recommendation
- Grading agents check for overconfidence before showing user anything
- The ethics aren't a disclaimer, they're the architecture

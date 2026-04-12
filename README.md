# Crucible
### *Decide with structure, not vibes.*

Crucible is a multi-agent AI pipeline that stress-tests your thinking before giving you an answer. Instead of one model validating your framing and handing you a recommendation, Crucible runs your decision through four specialized agents — each with an isolated system prompt, an adversarial posture, and a grader that enforces quality before anything proceeds.

Built at the Claude @ Stanford Buildathon 2026.

---

## The Problem

Anthropic studied 81,000 users and found that while 22% cite AI as a decision-making aid, **37% say it actively impedes good decisions** — the only category in the study where harm outweighs benefit. General-purpose AI validates your framing, notes some tradeoffs, and sends you into the world overconfident.

This isn't fixable with a better prompt. Helpfulness and adversarial rigor are in direct tension. A model optimized to be useful to you cannot simultaneously be optimized to challenge you. That conflict lives in the training objective, not the prompt.

Crucible fixes the process, not the answer.

---

## How It Works

### Stage 1 — Framer *(The Gatekeeper)*
Takes your raw decision and classifies it: values conflict, information gap, risk assessment, or interpersonal. Reflects it back to you clearly. **You must confirm the framing before the pipeline proceeds.** If we frame the wrong problem, everything downstream is worthless.

### Stage 2 — Excavator *(The Skeptic)*
An adversarial agent that drills layer by layer into your unstated assumptions until it hits bedrock — the irreducible value or fact your entire reasoning rests on. It is not there to help you. It is there to find what you haven't said. Runs a graded loop until depth, coverage, and independence all pass.

### Stage 3 — Steelman *(The Devil's Advocate)*
Argues the opposite of what you're leaning toward as powerfully as possible. **Critically: runs with zero access to the Excavator's output.** This prevents anchoring — we want two genuinely independent perspectives before Synthesis sees anything. Runs concurrently with Stage 2 via `Promise.all`.

### Stage 4 — Synthesizer *(The Judge)*
Only runs after Stages 2 and 3 have both passed grading. Produces a structured recommendation with:
- Explicit confidence percentage
- Every claim traced to a specific excavated assumption
- **Flip conditions** — the exact assumptions that, if wrong, would reverse the conclusion

---

## Architecture

```
User Input
    │
    ▼
┌─────────────┐
│   Framer    │  Stage 1 — classify + confirm
└──────┬──────┘
       │ confirmed
       ▼
┌──────────────────────────────────┐
│         Promise.all              │
│  ┌────────────┐  ┌────────────┐  │
│  │ Excavator  │  │ Steelman   │  │  Stages 2 & 3 — concurrent, isolated
│  │  (graded)  │  │  (graded)  │  │
│  └────────────┘  └────────────┘  │
└──────────────┬───────────────────┘
               │ both passed
               ▼
        ┌────────────┐
        │ Synthesizer│  Stage 4 — recommendation with confidence + flip conditions
        │  (graded)  │
        └────────────┘
```

Stages 2 and 3 run concurrently. The `LoopController` tracks the highest-scoring output across iterations and feeds grader feedback as structured input to the next pass. Up to 25 agent calls worst-case per decision.

Every stage streams token-by-token to the frontend via **Server-Sent Events**. A dropped connection mid-pipeline resumes exactly where it left off via in-memory SSE event buffering with 30-minute session TTL.

---

## Grading Rubrics

Termination is earned, not assumed. Every stage loops with targeted grader feedback until it passes.

| Stage | Dimension | Pass Threshold |
|-------|-----------|---------------|
| Assumption | Depth: reached bedrock? | ≥ 4/5 |
| Assumption | Coverage: assumption types found | ≥ 4/5 |
| Assumption | Independence: non-redundant | ≥ 3/5 |
| Steelman | Strength: moves a skeptic? | ≥ 4/5 |
| Steelman | Specificity: this decision, not generic | ≥ 4/5 |
| Steelman | Novelty: points user hasn't considered | ≥ 3/5 |
| Synthesis | Traceability: claims linked to prior stages | ≥ 4/5 |
| Synthesis | Intellectual honesty: uncertainty bounded | ≥ 4/5 |
| Synthesis | Completeness: all assumptions addressed | ≥ 4/5 |

---

## Tech Stack

- **Backend:** Node.js + Express + TypeScript
- **AI:** Anthropic Claude API (claude-sonnet-4) with streaming
- **Frontend:** React + Vite + Tailwind CSS + Framer Motion
- **Streaming:** Server-Sent Events (SSE) with resumable sessions
- **State:** Zustand
- **Monorepo:** Shared types package (`@crucible/shared`)

---

## Getting Started

### Prerequisites
- Node.js 18+
- Anthropic API key

### Installation

```bash
git clone https://github.com/your-repo/crucible
cd crucible
```

**Backend:**
```bash
cd backend
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
echo "VITE_API_URL=http://localhost:3001" > .env
npm install
npm run dev
```

Open `http://localhost:5173`

### Environment Variables

**Backend `.env`:**
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
MODEL_ID=claude-sonnet-4-20250514
PORT=3001
FRONTEND_URL=http://localhost:5173
MAX_LOOP_ITERATIONS=4
SESSION_TTL_MINUTES=30
```

---

## Project Structure

```
crucible/
├── backend/
│   └── src/
│       ├── config/          # Anthropic client + env validation
│       ├── prompts/         # System prompts for each agent
│       ├── services/
│       │   ├── agents/      # FramingAgent, AssumptionAgent, SteelmanAgent, SynthesisAgent
│       │   │   └── grading/ # AssumptionGrader, SteelmanGrader, SynthesisGrader
│       │   ├── orchestrator/ # PipelineOrchestrator + LoopController
│       │   └── CrucibleSession.ts
│       ├── routes/          # sessionRoutes
│       └── utils/           # SSE helpers, abort utilities
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── stores/
└── shared/                  # Shared TypeScript types
```

---

## Ethics

We sat with three tensions we didn't resolve easily.

**False confidence.** Our pipeline creates a feeling of rigor that could itself become the problem. We rejected a hard confidence ceiling as arbitrary. Instead, flip conditions are non-optional — the synthesis grader fails any output that doesn't surface what would reverse the conclusion.

**The agency paradox.** A system designed to protect human agency could, through its own authority, undermine it. We made the mechanics fully transparent: grader scores shown, iteration counts displayed, framing gate explicit.

**Scope.** We chose not to filter trivial decisions. A complexity gate would short-circuit these, but we were wary of building a system that decides which of your problems deserve serious thought.

We chose not to build a fast mode. That's the product Crucible replaces.

---

## The Team

Built at Claude @ Stanford Buildathon 2026.

*"The ethics of AI decision support can be the architecture, not a layer bolted on top of it."*

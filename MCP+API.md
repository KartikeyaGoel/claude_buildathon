<!-- /autoplan restore point: not yet saved -->

# Crucible: Production Build Plan
> Epistemic interrogation infrastructure for AI outputs. Cross-model divergence as reliability signal.

## Context

The hackathon produced a working single-model pipeline (Claude only) with:
- In-memory session store
- SSE streaming with resumption  
- Grading loops (assumption, steelman, synthesis)
- No auth, no persistence, no multi-model support

The new plan transforms this into a production backend:
- 4 heterogeneous model agents (Claude, GPT-4o, Gemini, Mistral)
- Postgres + pgvector + optional TimescaleDB
- Kuzu embedded graph database
- MCP server
- REST API with auth/rate limiting
- Tier 2 signal detection
- Caching, canonicalization, webhooks

**Constraint**: 50 user beta, no paid DB hosting credits. Local laptop hosting or Google Cloud (credits available).

---

## Repo Audit Results

### Location
The existing Crucible code lives at: `c:\Users\myan3\OneDrive - Stanford\Code\claude_buildathon\crucible\`
**Not** in `trading_bot\` — that directory is an empty git repo.

### What to KEEP (salvageable)
| File | What to reuse |
|------|--------------|
| `backend/src/services/orchestrator/PipelineOrchestrator.ts` | Orchestration pattern (phase gating, Promise.all parallel) |
| `backend/src/services/orchestrator/LoopController.ts` | Grading loop pattern |
| `backend/src/utils/sseHelpers.ts` | SSE with resumption (Last-Event-ID) |
| `backend/src/services/agents/streamCompletion.ts` | Token-streaming utilities |
| `backend/src/config/anthropic.ts` | Retry logic pattern (adapt per provider) |
| `backend/src/config/env.ts` | Zod env validation pattern |
| All `*.prompt.ts` files | System prompts (adapt for multi-model) |
| `shared/types.ts` | SSE event contracts |

### What to REPLACE
| File | Replacement |
|------|-------------|
| `SessionStore.ts` (in-memory) | Postgres |
| All agent files (Claude-only) | Multi-provider (Claude, GPT-4o, Gemini, Perplexity) |
| `sessionRoutes.ts` | New REST API surface |

### What to KEEP (frontend preserved)
The existing React frontend (`crucible/frontend/`) is kept for internal testing.
Do NOT replace or delete it. The new REST API must remain backward-compatible
with the existing SSE event contract in `shared/types.ts` so the frontend
continues to work during the refactor.

### Current API Surface (exists)
```
POST /api/sessions           → creates session
GET  /api/sessions/:id/stream → SSE
POST /api/sessions/:id/confirm-framing
POST /api/sessions/:id/cancel
GET  /api/health
```

### Current SSE Implementation
- Fetch-based with exponential backoff `[500ms, 1s, 2s, 4s, 8s, 16s, 30s]`
- Resumable via `Last-Event-ID` header
- Circular event buffer (100 events, 30min TTL)
- This is solid — wrap and reuse.

### Current Env Vars
```
ANTHROPIC_API_KEY, PORT, FRONTEND_URL, MODEL_ID, SESSION_TTL_MINUTES
MAX_LOOP_ITERATIONS, VITE_API_URL (frontend)
```

---

## Build Plan: 9 Blocks

### Block 1: Database Infrastructure

**1.1 — Postgres + Extensions**

Self-host on the spare laptop or Google Cloud VM (Cloud SQL free tier is 0.5GB/month, adequate for beta).

Extensions needed:
- `pgvector` — assumption embeddings (1536-dim)
- TimescaleDB — OPTIONAL (see CEO note below)

Tables to create:
- `users` (id, created_at, api_key_hash, plan_tier, daily_interrogation_count, daily_reset_at)
- `interrogation_context_records` (ICR)
- `deliberation_traces` (DT)
- `assumption_extraction_records` (AER) with `embedding vector(1536)`
- `resolution_artifacts` (RA)
- `execution_failure_records` (EFR)
- `interrogation_cache`
- `canonical_assumptions`
- `user_percentiles`
- `partner_webhooks`

Use `node-postgres` + `node-postgres-migrate` for migrations. Do NOT use raw SQL strings in app code.

**1.2 — Graph Storage: JSONB in Postgres (Kuzu skipped for beta)**

Store deliberation trace graphs as JSONB in `deliberation_traces.graph_json`. No Kuzu.

Structure:
```json
{
  "nodes": [{"id": "claim-1", "text": "...", "type": "empirical", "model_source": "claude"}],
  "edges": [{"from": "claim-1", "to": "claim-2", "type": "SUPPORTS", "confidence": 0.8}]
}
```

Add Kuzu when you need real graph traversal queries at scale (>10k traces).

---

### Block 2: Core Deliberation Engine

**2.1 — Heterogeneous Agent Orchestrator**

Four model families in parallel:
```
ADVOCATE  → claude-sonnet-4-20250514 (make the case FOR)
CRITIC    → gpt-4o via OpenAI API (make the case AGAINST)
STEELMAN  → gemini-1.5-pro via Google AI API (best opposing view)
BLIND SPOT → [UNRESOLVED — see CEO constraint below]
```

**DECIDED**: Perplexity API for blind spot agent (have credits, search-grounded gives different epistemic posture for temporal/factual assumptions).

Run with `Promise.all()`. 30s timeout. Partial success is OK (proceed with 3 agents, flag timeout).

**2.2 — Validity Judge**

Single Claude call AFTER four agents complete. Scores each assumption:
- Validity (0-1) × 0.3
- Consequence (0-1) × 0.4
- Novelty (0-1) × 0.3
= composite_score

Threshold: only return assumptions with composite_score > 0.4

**2.3 — Two-Stage Gating**

Stage 1: Heuristic (no API call) — triggers on:
- Text > 200 words
- Predictive language
- Domain keywords
- Numerical claims with confidence language

Stage 2: Claude Haiku (150 max tokens) — YES/NO decision + reason.

Track Stage 1 pass rate, Stage 2 pass rate, full pipeline trigger rate.

**2.4 — Response Composer**

Output structure:
```json
{
  "interrogation_id": "uuid",
  "trace_id": "string",
  "divergence_score": 0.0,
  "reliability_signal": "high|moderate|low|contested",
  "assumptions": [...],
  "divergence_details": {...},
  "metadata": {...}
}
```

After composing: write ICR → DT (Postgres + Kuzu) → AERs with embeddings.

---

### Block 3: MCP Server

SDK: `@modelcontextprotocol/sdk` (official Anthropic SDK).
Server name: `crucible`

Two tools:
1. `interrogate` — full pipeline, formatted output for Claude Desktop
2. `report_outcome` — write RA to Postgres

Format:
```
CRUCIBLE INTERROGATION
─────────────────────
DIVERGENCE: [High/Moderate/Low] — one sentence
ASSUMPTIONS SURFACED (sorted by consequence)
[1] [TYPE] — text
    Flagged by: Claude ✓  GPT-4o ✓  Gemini ✓  Mistral ✓
...
trace_id: [id]
```

**NOTE**: Tier 2 signal via MCP (Block 5) requires conversation context access. MCP tools are stateless between calls. The "watch next 5 messages" approach in the original plan will not work as described. See Block 5 for resolution.

---

### Block 4: REST API

Framework: Fastify (faster than Express, better TypeScript types).

Auth: `Authorization: Bearer {api_key}`. Hash stored keys with SHA-256 (not bcrypt — keys are random, not passwords).

Rate limiting: 10 interrogations/day free, unlimited pro. Track in `users.daily_interrogation_count`. Reset at midnight UTC via cron or on-request check.

Return 429 with `{ error: "rate_limit_exceeded", reset_at: "ISO timestamp" }` per RFC 7807.

Endpoints:
```
POST   /v1/interrogate          → pipeline + DB writes
POST   /v1/outcome              → write RA
GET    /v1/history              → paginated ICR list
GET    /v1/stats                → epistemic profile
POST   /v1/users/register       → create user + generate API key
GET    /v1/health               → liveness check
GET    /v1/dashboard/profile    → full epistemic profile
GET    /v1/dashboard/assumptions → paginated AERs
GET    /v1/dashboard/percentiles → user percentile ranks
POST   /v1/webhooks             → register webhook
DELETE /v1/webhooks/:id         → delete webhook
GET    /v1/webhooks             → list webhooks
DELETE /v1/cache/:hash          → admin cache invalidation
```

SSE streaming on `POST /v1/interrogate?stream=true`. Reuse `sseHelpers.ts` pattern.

---

### Block 5: Tier 2 Signal Detection

**MCP path**: MCP tools ARE stateless. The "watch next 5 messages" doesn't work at the MCP layer. 

Resolution: Store watch state in Postgres (`tier2_watches` table: icr_id, user_id, expires_at). On EVERY `interrogate` MCP tool call, check if there's a watch for this user → embed the incoming content → check similarity against recent assumptions → if hit, log Tier 2. This works because each `interrogate` call includes the user's new content.

**API path**: Add optional fields to `/v1/outcome`:
```json
{
  "followthrough_prompt": "string",
  "followthrough_detected": true
}
```

Similarity threshold: cosine similarity > 0.75 using pgvector.

---

### Block 6: Caching Layer

Hash: `sha256(content.trim().toLowerCase())`
Cache TTL: 24 hours
Logic:
- Cache hit: return cached DT, still write ICR + AERs (new user, new timestamp)
- Cache miss: run pipeline, write to cache

Manual invalidation: `DELETE /v1/cache/:hash` (admin only — add `is_admin` flag to users table).

---

### Block 7: Assumption Canonicalization

Post-processing step after validity judge.

Algorithm:
1. Embed new assumption via `text-embedding-ada-002`
2. Query centroid of existing canonical clusters in `canonical_assumptions`
3. If cosine similarity to nearest centroid > 0.85 → assign that canonical_id
4. Else → create new canonical_id

Format: `{domain}_{type}_{6char_hash}` (e.g., `financial_predictive_a3f2b1`)

Store canonical centroids in `canonical_assumptions.centroid_embedding vector(1536)`.

---

### Block 8: Dashboard API

Requires background job for percentiles (every 6 hours). Store results in `user_percentiles` table.
Use `pg-cron` (Postgres extension) or a simple Node.js cron for the percentile job.

---

### Block 9: Webhook System

HMAC-SHA256 signing with user secret. Use constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

Fire `high_consequence_flag` webhook when `composite_score > 0.8`.

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/crucible
KUZU_DB_PATH=./crucible_graph

# Model APIs
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
PERPLEXITY_API_KEY=   # or MISTRAL_API_KEY if credits obtained

# Embeddings
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002

# Server
PORT=3000
NODE_ENV=development

# Security
WEBHOOK_HMAC_SECRET=
ADMIN_API_KEY=   # for cache invalidation endpoint

# Rate limits
FREE_TIER_DAILY_LIMIT=10
CACHE_TTL_HOURS=24
```

---

## What Is NOT Built Yet

- Browser extension (Phase 2)
- Frontend dashboard UI (Phase 3)
- Local ONNX classifier (Phase 2)
- PEPD / ATE fine-tuning (Phase 2)
- Enterprise team tier (Phase 4)

---

## CEO Review Findings

### Premises to Confirm

**P1**: Cross-model divergence is a reliable signal for epistemic risk
- Mostly valid. Different RLHF produces different assumption surfacing.
- Caveat: all 4 models may share biases in certain domains (e.g., Western financial assumptions).
- This is the core product bet. Worth accepting.

**P2**: Users will report outcomes (Tier 2 signal)
- Weakest premise. High friction to ask users to self-report.
- MCP conversation-watching approach is better but has the statelessness constraint noted above.
- Risk: Tier 2 data may be sparse for 6+ months.

**P3**: 10 startup founders using it in 90 days
- Reachable via YC/Stanford network.
- MCP integration is the right wedge — founders already use Claude Desktop.

**P4**: Local hosting is fine for 50-user beta
- Yes. Self-hosted Postgres on spare laptop works. Google Cloud as backup.

**P5**: Mistral provides unique blind spot signal
- Partially valid. NO Mistral credits is a blocker.
- Resolution needed before Block 2.1 is complete.

### Dream State Delta

```
CURRENT (hackathon) → THIS PLAN → 12-MONTH IDEAL
─────────────────────────────────────────────────
Single model (Claude)  → 4 heterogeneous     → N models, user-selectable
In-memory sessions     → Postgres + pgvector  → Distributed (Redis + PG)
No auth                → API key auth         → OAuth + teams
No persistence         → Full data model      → Analytics + fine-tuning
No MCP                 → MCP server           → Browser extension + IDE plugins
No signal              → Tier 2 detection     → Calibration feedback loop
```

### What Already Exists (leverage map)
- Orchestration: `PipelineOrchestrator.ts` pattern → refactor to multi-provider
- SSE: `sseHelpers.ts` → reuse as-is
- Grading loops: `LoopController.ts` → adapt for validity judge
- Env validation: `env.ts` Zod pattern → extend for new vars
- Retry logic: `anthropic.ts` → generalize to `withRetry(provider, fn)` 

### NOT In Scope (CEO)
- Browser extension
- Fine-tuning on user data
- Team/enterprise features
- Real-time collaboration

### Error & Rescue Registry

| Error | Impact | Detection | Recovery |
|-------|--------|-----------|----------|
| Agent timeout (one of 4) | Partial result | 30s timeout per agent | Proceed with 3, flag in metadata |
| All agents fail | No result | Full timeout | Return error, don't write DT |
| Postgres down | Complete failure | Connection error | Queue writes, retry (not for beta) |
| Kuzu sync fails | Graph stale | Exception | Log + continue, retry async |
| Embedding API down | No canonicalization | HTTP error | Skip embedding, write AER without vector |
| Rate limit hit (user) | Blocked interrogation | Count check | 429 with reset_at |

### Failure Modes Registry

| Failure | Likelihood | Consequence | Mitigation |
|---------|------------|-------------|------------|
| Mistral credits missing | HIGH | Blind spot agent broken | Use Perplexity or Haiku |
| Gemini rate limits hit | MEDIUM | STEELMAN agent degraded | Exponential backoff |
| OpenAI embedding costs | LOW | Budget drain | Small at 50 users |
| Tier 2 data sparse | HIGH | Profile feature weak | Set expectations, use MCP approach |
| Kuzu-Postgres desync | MEDIUM | Graph stale | Idempotent sync, retry queue |
| Local laptop uptime | MEDIUM | Beta downtime | Google Cloud as failover |

### CEO Completion Summary
- Scope: Well-calibrated for beta
- Core bet (cross-model divergence) is valid
- Two concerns: Mistral credits, Tier 2 data sparsity
- Recommend: Resolve Mistral before Block 2.1, accept Tier 2 risk

---

## Eng Review Findings

### Architecture ASCII Diagram

```
                                    User
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                  │
               Claude Desktop    REST Client         Browser
                    │           (curl/Postman)        (future)
                    │                 │
                    ▼                 ▼
              ┌──────────┐    ┌─────────────┐
              │ MCP      │    │ REST API    │
              │ Server   │    │ (Fastify)   │
              └────┬─────┘    └──────┬──────┘
                   │                 │
                   └────────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Two-Stage Gate │
                    │ (heuristic +   │
                    │  Haiku screen) │
                    └───────┬────────┘
                            │ (if pass)
                    ┌───────▼────────┐
                    │ Cache Check    │
                    │ (SHA-256 hash  │
                    │  → Postgres)   │
                    └───────┬────────┘
                            │ (cache miss)
              ┌─────────────▼─────────────────┐
              │       Promise.all([])          │
              │  ┌────────┐  ┌────────┐        │
              │  │ADVOCATE│  │CRITIC  │        │
              │  │Claude  │  │GPT-4o  │        │
              │  └────────┘  └────────┘        │
              │  ┌────────┐  ┌────────┐        │
              │  │STEELMAN│  │BLIND   │        │
              │  │Gemini  │  │SPOT    │        │
              │  └────────┘  │Perpl/? │        │
              └──────────────┴────────┴────────┘
                            │
                    ┌───────▼────────┐
                    │ Validity Judge │
                    │ (Claude Haiku) │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Response       │
                    │ Composer       │
                    └───────┬────────┘
                            │
              ┌─────────────▼──────────────┐
              │                            │
        ┌─────▼────┐                ┌──────▼─────┐
        │ Postgres │                │ Kuzu Graph │
        │ (ICR,DT, │                │ (Claims +  │
        │ AER,RA..)│                │  Edges)    │
        └──────────┘                └────────────┘
```

### Critical Eng Concerns

**1. Kuzu operational complexity for beta scale**
- Kuzu is embedded (good) but adds a second consistency domain
- At 50 users, JSONB in Postgres handles the graph traversal just fine
- Recommend: TASTE DECISION (see audit trail below)

**2. TimescaleDB for 50 users**
- TimescaleDB requires extension installation
- Plain Postgres timestamptz columns with regular indexes serve the time-series queries for 50 users
- Recommend: Skip TimescaleDB for beta, add if needed

**3. Connection pooling**
- Raw `pg` without pooling = connection exhaustion under concurrent interrogations
- MUST use `pg-pool` (built into node-postgres) or `pgbouncer`

**4. API key storage**
- Store SHA-256 hash of key, not plaintext
- Return plaintext only once at registration

**5. MCP Tier 2 statelessness**
- MCP tool calls are stateless. "Watch next 5 messages" doesn't work.
- Resolution in Block 5 above (embed incoming content on every interrogate call)

**6. Missing: migration framework**
- 8 tables + foreign keys need `node-pg-migrate` or similar
- Do NOT apply schema with raw SQL in app startup

**7. docker-compose.yml is missing**
- Blocks local dev for anyone new to the project
- Postgres + pgvector need specific container setup

### Test Diagram

| Flow | Type | Test Exists? | Gap? |
|------|------|-------------|------|
| Stage 1 heuristic filter | Unit | No | YES — add |
| Stage 2 Haiku screen | Integration | No | YES — add |
| 4-agent parallel execution | Integration | No | YES — add |
| Agent timeout handling | Unit | No | CRITICAL |
| Validity judge scoring | Unit | No | YES — add |
| Cache hit path | Integration | No | YES — add |
| Cache miss path | Integration | No | YES — add |
| Assumption canonicalization | Unit | No | YES — add |
| Kuzu sync function | Unit | No | YES — add |
| MCP tool response format | Integration | No | YES — add |
| REST auth middleware | Unit | No | CRITICAL |
| Rate limit enforcement | Integration | No | CRITICAL |
| Tier 2 similarity check | Unit | No | YES — add |
| SSE stream resume | Integration | Partial (existing pattern) | Adapt |
| Webhook HMAC signing | Unit | No | YES — add |

### NOT In Scope (Eng)
- Load testing (50 users, not needed)
- Blue-green deploy (overkill for beta)
- Distributed caching

### What Already Exists (leverage map)
- `sseHelpers.ts` → reuse unchanged
- `streamCompletion.ts` → adapt for multi-provider
- `LoopController.ts` → adapt for validity judge loop
- `env.ts` Zod pattern → extend
- `vitest.config.ts` → already configured, just add tests

### Eng Completion Summary
- Architecture is sound with adjustments noted
- Critical path: Postgres migrations + connection pooling + multi-provider auth
- Two TASTE DECISIONs: Kuzu vs JSONB, TimescaleDB vs plain Postgres

---

## DX Review Findings

### Product Type
Developer tool + API. Primary users: startup founders integrating Crucible into agent pipelines. Secondary: Claude Desktop users via MCP.

### TTHW (Time To Hello World)
Current plan: ~45 minutes (4 API keys + DB setup + migrations + env config)
Target: < 10 minutes

Gap: No `docker-compose.yml`. No quickstart script. No Postman collection.

### Developer Journey Map

| Stage | Current State | Gap |
|-------|--------------|-----|
| Discovery | README exists (hackathon quality) | Needs production README |
| Install | Manual Postgres + pgvector setup | No docker-compose |
| Configure | 6+ env vars manually | No `.env.example` for new system |
| First call | No docs for new API | Need cURL examples |
| Integration | MCP config for Claude Desktop | Not documented |
| Debug | No structured error responses | Need RFC 7807 errors |
| Monitor | No health endpoint details | Add status response |

### DX Scorecard

| Dimension | Score | Gap |
|-----------|-------|-----|
| Getting started < 5 min | 2/10 | docker-compose, quickstart |
| API naming guessable | 8/10 | `/v1/interrogate` is clear |
| Error messages actionable | 5/10 | Need RFC 7807 + error codes |
| Docs findable & complete | 3/10 | No production docs |
| Upgrade path safe | 6/10 | Migrations planned but not versioned |
| Dev environment friction-free | 3/10 | 4 API keys before first run |
| MCP setup documented | 0/10 | Completely missing |
| Webhook integration guide | 4/10 | Spec exists, no example code |

### DX Implementation Checklist

Critical (before any users):
- [ ] `docker-compose.yml` with Postgres + pgvector
- [ ] `README.md` with 5-minute quickstart (one API key minimum path)
- [ ] MCP configuration instructions for Claude Desktop
- [ ] `.env.example` for all new env vars
- [ ] At least one `curl` example per endpoint
- [ ] RFC 7807 error response format

Should have:
- [ ] Postman/Bruno collection
- [ ] `npm run setup` script that runs migrations
- [ ] Structured error codes (e.g., `RATE_LIMIT_EXCEEDED`, `GATE_BLOCKED`)

Nice to have:
- [ ] Interactive API docs (Swagger/Scalar)
- [ ] SDK wrapper (long-term)

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Keep TimescaleDB (user chose) | User Decision | User | User wants TimescaleDB from day one despite 50-user scale | Plain Postgres timestamps |
| 2 | CEO | Use Perplexity for blind spot agent | User Decision | User | User confirmed Perplexity as 4th agent | Mistral (no credits), Haiku (same family as Claude) |
| 3 | CEO | Accept Tier 2 data sparsity risk | Mechanical | P6 (bias to action) | Ship MCP first, iterate on data collection | Delay launch until Tier 2 solved |
| 4 | Eng | Use pg-pool (connection pooling) | Mechanical | P1 (completeness) | Prevents connection exhaustion | Raw pg connections |
| 5 | Eng | Store API key as SHA-256 hash | Mechanical | P1 (completeness) | Security requirement | Plaintext storage |
| 6 | Eng | JSONB in Postgres (skip Kuzu) | User Decision | User | User confirmed JSONB for beta, Kuzu deferred | Kuzu embedded graph |
| 7 | Eng | Use node-pg-migrate for migrations | Mechanical | P5 (explicit) | Standard, well-understood tooling | Manual SQL, Prisma |
| 8 | Eng | Use Fastify instead of Express | Mechanical | P3 (pragmatic) | Better TypeScript + faster | Express (already used in hackathon) |
| 9 | Eng | docker-compose.yml is required (Block 1) | Mechanical | P1 (completeness) | Otherwise TTHW > 30min | Manual Postgres setup |
| 10 | DX | RFC 7807 error format | Mechanical | P1 (completeness) | Standard, parseable by clients | Ad-hoc error objects |
| 11 | DX | curl examples in README | Mechanical | P1 (completeness) | Minimum viable docs for developers | No docs |
| 12 | DX | MCP setup instructions required | Mechanical | P1 (completeness) | Primary integration path | Assume users know |

---

## Verification Plan

**Block 1 verification:**
```bash
docker-compose up -d
psql $DATABASE_URL -c "\d users"  # tables exist
# Insert test user, verify api_key_hash stored
```

**Block 2 verification:**
```bash
curl -X POST http://localhost:3000/v1/interrogate \
  -H "Authorization: Bearer test_key" \
  -d '{"content": "The market will grow 20% in 2025 driven by AI adoption"}'
# Should return assumptions from 4 agents within 30s
```

**Block 3 (MCP) verification:**
- Add to Claude Desktop `claude_desktop_config.json`
- Run `interrogate` tool in Claude Desktop
- Verify formatted output appears inline

**Block 4 (REST API) verification:**
```bash
# Register
curl -X POST /v1/users/register → {api_key}
# Interrogate
curl -X POST /v1/interrogate -H "Authorization: Bearer {key}" ...
# Rate limit: 11th call should return 429
# SSE streaming: curl -N /v1/interrogate?stream=true
```

**Block 5 (Tier 2) verification:**
```bash
# After interrogation, send similar content
curl -X POST /v1/interrogate -H "Authorization: Bearer {key}" \
  -d '{"content": "similar to previous assumption text"}'
# Check resolution_artifacts table for tier2_followthrough = true
```

---

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings |
|--------|------|--------|----------|
| CEO Review | 1 | issues_open | Mistral credits, Tier 2 sparsity |
| Eng Review | 1 | issues_open | Kuzu complexity, missing docker-compose, connection pooling |
| Design Review | 0 | SKIPPED | No UI scope |
| DX Review | 1 | issues_open | TTHW 45min, missing MCP docs |

**Verdict:** APPROVED — all premises confirmed, taste decisions resolved.

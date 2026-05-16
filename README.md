# Crucible
### *Decide with structure, not vibes.*

Crucible is a multi-agent AI pipeline that stress-tests your thinking before giving you an answer. Instead of one model validating your framing and handing you a recommendation, Crucible runs your decision through four specialized agents — each with an isolated system prompt, an adversarial posture, and a grader that enforces quality before anything proceeds.

Built at the Claude @ Stanford Buildathon 2026.

**Crucible v2 (production backend)** adds Postgres (with pgvector), a Fastify **REST API** under `/v1` (enterprise / integrations), and **MCP** for consumers via **remote Streamable HTTP** at **`/mcp`**, plus optional **local stdio** for developers. On **Google Cloud Run**, production uses **two services** from the same image—**`crucible-api`** (horizontally scaled) and **`crucible-mcp`** (single instance for MCP session state)—sharing Cloud SQL. Locally, **`CRUCIBLE_SERVICE_ROLE=all`** runs both in one process. The hackathon **SSE session UI** remains on legacy `/api/sessions/*`. The full engineering plan lives in [MCP+API.md](./MCP+API.md).

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

## Architecture (high level)

- **Local dev:** one process (`CRUCIBLE_SERVICE_ROLE=all`): **`/mcp`**, **`/v1/*`**, legacy **`/api/*`**.
- **Production (GCP):** two Cloud Run services, same container image:
  - **`crucible-mcp`** — only **`/mcp`** + **`GET /health`**; **`--max-instances=1`** (Streamable HTTP sessions live in memory).
  - **`crucible-api`** — **`/v1/*`**, legacy **`/api/*`**; scales horizontally (default max 20 in `cloudbuild.yaml`).
- **Optional local MCP:** `npm run mcp:stdio` — stdio transport for Claude Desktop without a public URL.
- **Database:** PostgreSQL with pgvector (Docker locally, Cloud SQL on GCP).

```
                    ┌─────────────────────┐
Consumers ────────► │ Cloud Run           │
(Claude MCP, …)     │ crucible-mcp        │──┐
                    │ HTTPS …/mcp         │  │
                    └─────────────────────┘  │
                                             ├──► PostgreSQL
                    ┌─────────────────────┐  │
Enterprises ──────► │ Cloud Run           │  │
(/v1, webhooks)     │ crucible-api        │──┘
                    │ HTTPS …/v1          │
                    └─────────────────────┘
```

**Hosted MCP URL:** `https://<crucible-mcp-host>/mcp` in production, or `http://localhost:3001/mcp` when running locally with `CRUCIBLE_SERVICE_ROLE=all`. Users authenticate with the same **`api_key`** as the REST API: `Authorization: Bearer <api_key>` on every MCP request (register via **`crucible-api`** / `POST /v1/users/register`).

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

- **Backend:** Node.js + **Fastify** + TypeScript
- **AI:** Anthropic, OpenAI, Google Generative AI, Perplexity (see `.env.example`)
- **Data:** PostgreSQL, **pgvector**, `node-pg-migrate`
- **MCP:** `@modelcontextprotocol/sdk` (server name `crucible`)
- **Frontend:** React + Vite + Tailwind CSS + Framer Motion (hackathon UI; points at backend SSE)
- **Monorepo:** npm workspaces — `@crucible/shared`, `crucible-backend`, `crucible-frontend`
- **Container:** `crucible/backend/Dockerfile` (distroless Node 22); **GCP** Cloud Build → Artifact Registry → **two** Cloud Run services (`crucible-api`, `crucible-mcp`) + migration job

---

## Getting Started (local)

### Prerequisites

- **Node.js 22** (matches the production Docker image; newer LTS is fine for local dev)
- **Docker** (for Postgres)
- API keys as needed: at minimum **ANTHROPIC_API_KEY**; full pipeline needs OpenAI, Google AI, and Perplexity keys (see `crucible/backend/.env.example`)

### 1. Install dependencies

From the **repository root** (the folder that contains `package.json` and `crucible/`):

```bash
git clone <your-fork-or-upstream-url> claude_buildathon
cd claude_buildathon
npm install
```

### 2. Start PostgreSQL

```bash
docker compose -f crucible/docker-compose.yml up -d
```

This starts Postgres 16 with pgvector on port **5432** (user/password/db: `crucible` / `crucible_dev` / `crucible` — same defaults as `.env.example`).

### 3. Configure the backend

```bash
cd crucible/backend
cp .env.example .env
```

Edit `.env` and set at least `ANTHROPIC_API_KEY`. Add the other provider keys to run the full multi-model `/v1` pipeline.

`env` loading order: optional `.env.local` (e.g. from `npm run secrets:pull`) is loaded first, then `.env`.

### 4. Run migrations

Still in `crucible/backend`:

```bash
npm run migrate:up
```

Or from repo root: `npm run migrate:up -w crucible-backend`.

### 5. Run the API + legacy session server

```bash
cd crucible/backend
npm run dev
```

Default URL: **http://localhost:3001** (see `PORT` in `.env`).

- **Health:** `GET http://localhost:3001/v1/health` (and `GET /api/health`)
- **Register API user:** `POST http://localhost:3001/v1/users/register` — save the returned `api_key` (shown once)
- **Interrogate:** `POST http://localhost:3001/v1/interrogate` with `Authorization: Bearer <api_key>`

More routes are documented in [MCP+API.md](./MCP+API.md).

### 6. (Optional) Hackathon frontend

```bash
cd crucible/frontend
echo "VITE_API_URL=http://localhost:3001" > .env
npm install
npm run dev
```

Open the URL Vite prints (typically **http://localhost:5173**). Ensure `FRONTEND_URL` in the backend `.env` matches that origin for CORS.

---

## MCP (consumers)

Server name: **`crucible`**. Tools: **`interrogate`**, **`report_outcome`**.

### Hosted MCP (recommended for customers)

No repo checkout: they use the **`crucible-mcp`** service URL + **`/mcp`** with a client that supports **Streamable HTTP**.

1. They register (or you provision) a user and obtain **`api_key`** from **`POST https://<crucible-api-host>/v1/users/register`** (same key works for REST and MCP).
2. In the MCP client they set the server URL to **`https://<crucible-mcp-host>/mcp`**. The server expects **`Authorization: Bearer <api_key>`** on MCP HTTP requests (initialize, follow-up POSTs, SSE GET, DELETE).

**`PUBLIC_API_URL`** is set per service after deploy: the **MCP** service’s value must be the **MCP** Cloud Run URL (for Streamable HTTP **DNS rebinding** protection). The **API** service gets its own URL (canonical base for webhooks and future links). Optional **`MCP_ALLOWED_HOSTS`** (comma-separated) allows extra `Host` headers (e.g. custom domain on `crucible-mcp`).

**Scaling:** **`crucible-mcp`** stays at **`--max-instances=1`** by design. **`crucible-api`** scales independently (tune `--max-instances` in `cloudbuild.yaml`).

### Local stdio MCP (developers)

Uses **`CRUCIBLE_API_KEY`** in `.env` (must equal a registered **`api_key`**). Run:

```bash
cd crucible/backend
npm run mcp:stdio
```

**Claude Desktop** can point at that process, for example:

```json
{
  "mcpServers": {
    "crucible": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "cwd": "/ABSOLUTE/PATH/TO/claude_buildathon/crucible/backend",
      "env": {
        "DATABASE_URL": "postgresql://crucible:crucible_dev@localhost:5432/crucible",
        "ANTHROPIC_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key",
        "GOOGLE_GENERATIVE_AI_API_KEY": "your-key",
        "PERPLEXITY_API_KEY": "your-key",
        "CRUCIBLE_API_KEY": "the-api-key-from-register"
      }
    }
  }
}
```

---

## Docker image (local or CI)

Build from the **repository root** (build context is `.`):

```bash
docker build -f crucible/backend/Dockerfile -t crucible-api:local .
```

Run (example: Postgres on the host Mac/Windows; adjust `DATABASE_URL` for Linux):

```bash
docker run --rm -p 3001:3001 \
  --env-file crucible/backend/.env \
  -e DATABASE_URL=postgresql://crucible:crucible_dev@host.docker.internal:5432/crucible \
  crucible-api:local
```

Use credentials that match your DB; for the compose stack, you may need to create a DB user that accepts connections from the Docker bridge or point `DATABASE_URL` at `host.docker.internal` with the same user/password as in `docker-compose.yml`.

---

## Google Cloud (Postgres + split API / MCP)

One **Cloud Build** pipeline builds a **single image**, runs DB migrations (Cloud Run job), deploys **two Cloud Run services**—**`crucible-api`** and **`crucible-mcp`**—then sets **`PUBLIC_API_URL`** on each to that service’s own URL.

### 1. One-time infrastructure

From the repo root (after `gcloud auth login` and choosing a project):

```bash
export PROJECT_ID=your-project-id
./crucible/backend/gcp/bootstrap-infra.sh
```

That enables APIs, creates the **`crucible`** Artifact Registry repo (default region `us-central1`), and a **serverless VPC connector** (`crucible-serverless` by default). It does **not** create Cloud SQL or secrets — you still:

- Create a **Cloud SQL for PostgreSQL** instance (name should match `cloudbuild.yaml` substitution **`_CLOUD_SQL_INSTANCE`**, default pattern `PROJECT_ID:REGION:crucible-postgres`).
- In the DB: `CREATE EXTENSION IF NOT EXISTS vector;`
- Add **Secret Manager** secrets referenced in `cloudbuild.yaml`: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `PERPLEXITY_API_KEY`, `WEBHOOK_HMAC_SECRET`, `ADMIN_API_KEY` (same list as `npm run secrets:pull`).

Align **`_CLOUD_SQL_INSTANCE`** and **`_VPC_CONNECTOR`** in **`crucible/backend/cloudbuild.yaml`** with your instance connection name and connector name.

### 2. Deploy (build + migrate + Cloud Run)

```bash
gcloud builds submit --config crucible/backend/cloudbuild.yaml .
```

This creates/updates **`crucible-api`** (default **`--max-instances=20`**) and **`crucible-mcp`** (**`--max-instances=1`**). Substitutions **`_SERVICE_API`** / **`_SERVICE_MCP`** in `cloudbuild.yaml` rename the services if needed.

**Local secrets from GCP** (developer machines): from `crucible/backend`,

```bash
npm run secrets:pull
```

writes **`.env.local`** (do not commit it).

More ops notes: `crucible/backend/gcp/alerts.md`.

---

## Environment variables

Authoritative template: **`crucible/backend/.env.example`**. Notable entries:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `PERPLEXITY_API_KEY` | Model providers |
| `PORT` | HTTP port (default `3001`) |
| `FRONTEND_URL` | CORS origin for the Vite app |
| `PUBLIC_API_URL` | Canonical URL of **this** process (set to API URL on `crucible-api`, MCP URL on `crucible-mcp`; MCP uses it for DNS rebinding) |
| `CRUCIBLE_SERVICE_ROLE` | **`all`** (local default), **`api`**, or **`mcp`** — Cloud Run sets `api` / `mcp` via `cloudbuild.yaml` |
| `MCP_ALLOWED_HOSTS` | Optional comma-separated extra `Host` values allowed for `/mcp` |
| `CRUCIBLE_API_KEY` | **Local stdio MCP only:** plaintext key from `/v1/users/register` |
| `ADMIN_API_KEY` | Admin-only routes (e.g. cache invalidation) |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_CLOUD_SQL_INSTANCE` | GCP metadata (production / tooling) |

---

## Project structure

```
claude_buildathon/
├── package.json              # workspaces: shared, backend, frontend
├── crucible/
│   ├── docker-compose.yml    # Postgres + pgvector
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── cloudbuild.yaml   # Cloud Run + migrate job
│   │   ├── .env.example
│   │   └── src/
│   │       ├── index.ts      # Fastify app
│   │       ├── mcp/          # Streamable HTTP /mcp, stdio, tools
│   │       ├── routes/       # v1 + legacy
│   │       ├── db/           # pool, migrations
│   │       └── services/     # orchestrator, engine, agents
│   ├── frontend/             # React hackathon UI
│   └── shared/               # @crucible/shared types
└── MCP+API.md                # Crucible v2 plan & API reference
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

---

## Local MCP testing

Quick local smoke test flow (no Claude Desktop config required here):

1. Start backend over HTTP MCP (`/mcp`):

```bash
cd crucible/backend
npm run dev
```

Then in another terminal:

```bash
curl -X GET http://localhost:3001/v1/health
curl -X POST http://localhost:3001/v1/users/register
```

Use the returned `api_key` to call MCP HTTP locally at `http://localhost:3001/mcp` with `Authorization: Bearer <api_key>`.

2. Start stdio MCP directly:

```bash
cd crucible/backend
npm run mcp:stdio
```

If your client has issues with npm working directory or noisy stdout, use:

```bash
/Users/test/.nvm/versions/node/v20.19.2/bin/npm --prefix /Users/test/Documents/GitHub/claude_buildathon/crucible/backend --silent run mcp:stdio
```

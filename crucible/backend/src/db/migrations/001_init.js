export async function up(pgm) {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      api_key_hash text NOT NULL UNIQUE,
      api_key_prefix text NOT NULL,
      plan_tier text NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'admin')),
      daily_interrogation_count integer NOT NULL DEFAULT 0 CHECK (daily_interrogation_count >= 0),
      daily_reset_at timestamptz NOT NULL DEFAULT (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'),
      in_flight_count integer NOT NULL DEFAULT 0 CHECK (in_flight_count >= 0),
      is_admin boolean NOT NULL DEFAULT false,
      deleted_at timestamptz
    );

    CREATE TABLE canonical_assumptions (
      id text PRIMARY KEY,
      domain text NOT NULL,
      assumption_type text NOT NULL,
      representative_text text,
      centroid_embedding vector(1536),
      occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 0),
      avg_engagement_rate numeric NOT NULL DEFAULT 0 CHECK (avg_engagement_rate >= 0 AND avg_engagement_rate <= 1),
      first_seen timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE interrogation_context_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trace_id text NOT NULL UNIQUE,
      content_hash text NOT NULL,
      originating_model text NOT NULL DEFAULT 'other' CHECK (originating_model IN ('claude', 'gpt4o', 'gemini', 'perplexity', 'mistral', 'other')),
      domain_tag text NOT NULL DEFAULT 'other' CHECK (domain_tag IN ('financial', 'medical', 'legal', 'technical', 'policy', 'personal', 'other')),
      claim_type_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
      raw_content text NOT NULL,
      source text NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'mcp', 'extension', 'legacy')),
      session_id text,
      gate_stage1_passed boolean NOT NULL DEFAULT false,
      gate_stage2_passed boolean,
      gate_reason text,
      cache_hit boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE deliberation_traces (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      icr_id uuid NOT NULL UNIQUE REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      graph_json jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
      model_agreement_map jsonb NOT NULL DEFAULT '{}'::jsonb,
      validity_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
      agent_outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
      validity_judgement jsonb NOT NULL DEFAULT '{}'::jsonb,
      divergence_score numeric NOT NULL DEFAULT 0 CHECK (divergence_score >= 0 AND divergence_score <= 1),
      reliability_signal text NOT NULL DEFAULT 'moderate' CHECK (reliability_signal IN ('high', 'moderate', 'low', 'contested')),
      degraded_agents text[] NOT NULL DEFAULT ARRAY[]::text[],
      cached boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE assumption_extraction_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dt_id uuid NOT NULL REFERENCES deliberation_traces(id) ON DELETE CASCADE,
      icr_id uuid NOT NULL REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      canonical_id text REFERENCES canonical_assumptions(id) ON DELETE SET NULL,
      raw_text text NOT NULL,
      assumption_type text NOT NULL CHECK (assumption_type IN ('empirical', 'causal', 'normative', 'strategic', 'predictive', 'unknown')),
      domain_cluster text NOT NULL DEFAULT 'general',
      models_flagging text[] NOT NULL DEFAULT ARRAY[]::text[],
      models_accepting text[] NOT NULL DEFAULT ARRAY[]::text[],
      cross_model_agreement_score numeric NOT NULL DEFAULT 0 CHECK (cross_model_agreement_score >= 0 AND cross_model_agreement_score <= 1),
      validity_score numeric NOT NULL CHECK (validity_score >= 0 AND validity_score <= 1),
      consequence_score numeric NOT NULL CHECK (consequence_score >= 0 AND consequence_score <= 1),
      novelty_score numeric NOT NULL CHECK (novelty_score >= 0 AND novelty_score <= 1),
      relevance_score numeric NOT NULL DEFAULT 0 CHECK (relevance_score >= 0 AND relevance_score <= 1),
      composite_score numeric NOT NULL CHECK (composite_score >= 0 AND composite_score <= 1),
      embedding vector(1536),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE resolution_artifacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      icr_id uuid NOT NULL REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      decision text NOT NULL,
      outcome text,
      confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      tier1_time_spent_ms integer CHECK (tier1_time_spent_ms IS NULL OR tier1_time_spent_ms >= 0),
      tier2_followthrough boolean NOT NULL DEFAULT false,
      tier2_detected_at timestamptz,
      tier2_followthrough_prompt text,
      inline_resolution text CHECK (inline_resolution IS NULL OR inline_resolution IN ('yes', 'no', 'partially')),
      inline_resolved_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE execution_failure_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      icr_id uuid REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      dt_id uuid REFERENCES deliberation_traces(id) ON DELETE CASCADE,
      trace_id text UNIQUE,
      action_taken text,
      execution_succeeded boolean,
      failure_mode text,
      outcome_reported_at timestamptz,
      assumption_id_implicated uuid REFERENCES assumption_extraction_records(id) ON DELETE SET NULL,
      provider text,
      failure_type text NOT NULL,
      error_code text,
      error_message text NOT NULL,
      retryable boolean NOT NULL DEFAULT false,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE interrogation_cache (
      content_hash text NOT NULL,
      domain_tag text NOT NULL DEFAULT 'other',
      originating_model text NOT NULL DEFAULT 'other',
      dt_id uuid NOT NULL REFERENCES deliberation_traces(id) ON DELETE CASCADE,
      response_json jsonb NOT NULL,
      cached_dt_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      expires_at timestamptz NOT NULL,
      hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
      redacted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (content_hash, domain_tag, originating_model)
    );

    CREATE TABLE tier2_watches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      icr_id uuid NOT NULL REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE user_percentiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metric text NOT NULL,
      percentile numeric NOT NULL CHECK (percentile >= 0 AND percentile <= 100),
      sample_size integer NOT NULL CHECK (sample_size >= 0),
      computed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, metric)
    );

    CREATE TABLE partner_webhooks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url text NOT NULL,
      secret_hash text NOT NULL,
      secret_ciphertext text NOT NULL,
      event_types text[] NOT NULL DEFAULT ARRAY['high_consequence_flag']::text[],
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE webhook_dead_letters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      webhook_id uuid REFERENCES partner_webhooks(id) ON DELETE SET NULL,
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      last_status integer,
      last_error text,
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      action text NOT NULL,
      resource_type text NOT NULL,
      resource_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE aer_embedding_backfill (
      aer_id uuid PRIMARY KEY REFERENCES assumption_extraction_records(id) ON DELETE CASCADE,
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error text,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX users_api_key_hash_idx ON users(api_key_hash);
    CREATE INDEX interrogation_context_user_created_idx ON interrogation_context_records(user_id, created_at DESC);
    CREATE INDEX interrogation_context_content_hash_idx ON interrogation_context_records(content_hash);
    CREATE INDEX interrogation_context_domain_idx ON interrogation_context_records(user_id, domain_tag, created_at DESC);
    CREATE INDEX deliberation_traces_created_idx ON deliberation_traces(created_at DESC);
    CREATE INDEX aer_user_created_idx ON assumption_extraction_records(user_id, created_at DESC);
    CREATE INDEX aer_canonical_idx ON assumption_extraction_records(canonical_id);
    CREATE INDEX aer_icr_idx ON assumption_extraction_records(icr_id);
    CREATE INDEX aer_composite_idx ON assumption_extraction_records(composite_score DESC);
    CREATE INDEX interrogation_cache_expires_idx ON interrogation_cache(expires_at);
    CREATE INDEX tier2_watches_user_expires_idx ON tier2_watches(user_id, expires_at);
    CREATE INDEX partner_webhooks_user_idx ON partner_webhooks(user_id);
    CREATE INDEX audit_log_actor_created_idx ON audit_log(actor_user_id, created_at DESC);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS aer_embedding_backfill;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS webhook_dead_letters;
    DROP TABLE IF EXISTS partner_webhooks;
    DROP TABLE IF EXISTS user_percentiles;
    DROP TABLE IF EXISTS tier2_watches;
    DROP TABLE IF EXISTS interrogation_cache;
    DROP TABLE IF EXISTS execution_failure_records;
    DROP TABLE IF EXISTS resolution_artifacts;
    DROP TABLE IF EXISTS assumption_extraction_records;
    DROP TABLE IF EXISTS deliberation_traces;
    DROP TABLE IF EXISTS interrogation_context_records;
    DROP TABLE IF EXISTS canonical_assumptions;
    DROP TABLE IF EXISTS users;
  `);
}

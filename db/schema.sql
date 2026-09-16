-- MigrationPilot starter schema — PostgreSQL + pgvector
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  owner text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_scan_at timestamptz,
  latest_commit_sha text,
  latest_findings_fingerprint text
);

CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha text,
  status text NOT NULL CHECK (status IN (
    'queued','cloning','scanning','retrieving_guidance','generating_report','completed','failed'
  )),
  aws_sdk_v2_detected boolean,
  declared_v2_version text,
  dependency_section text,
  detected_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings_fingerprint text,
  tool_calls integer NOT NULL DEFAULT 0,
  latency_ms integer,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  service text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('high','medium','low')),
  confidence text NOT NULL CHECK (confidence IN ('direct','contextual','heuristic')),
  manual_review boolean NOT NULL DEFAULT false,
  file_path text NOT NULL,
  line_number integer,
  snippet text,
  migration_topic text NOT NULL,
  rationale text NOT NULL,
  recommendation text,
  recommendation_status text NOT NULL DEFAULT 'pending'
    CHECK (recommendation_status IN ('pending','supported','manual_review','guidance_unavailable')),
  migration_doc_chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
  summary jsonb NOT NULL,
  migration_plan jsonb NOT NULL,
  surfaced_to_user boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Titan Text Embeddings V2 starter dimension.
CREATE TABLE IF NOT EXISTS migration_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  title text NOT NULL,
  section text,
  service text,
  migration_topic text,
  content text NOT NULL,
  content_hash text NOT NULL UNIQUE,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scans_repo_started ON scans(repository_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_rule ON findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_migration_docs_topic ON migration_docs(migration_topic);

-- The migration corpus is small; exact vector search is fine initially.
-- Add an approximate vector index only if data/latency justifies it.

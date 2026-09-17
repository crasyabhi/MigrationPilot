# MigrationPilot — Architecture Decision Log

## ADR-001 — One migration only
Product scope is AWS SDK JS v2→v3. Revisit only after the measured core is stable.

## ADR-002 — TypeScript Strands
Use `@strands-agents/sdk`. Switch language only if a required capability is actually unavailable.

## ADR-003 — Official AWS docs are primary RAG sources
Do not mix unreviewed third-party content into the authoritative corpus.

## ADR-004 — Deterministic scanner before LLM
Source/file facts must be measurable and reproducible. Agent handles judgment, retrieval choice, prioritization, and planning.

## ADR-005 — Regex/context first; AST only when measured
Do not build static-analysis infrastructure until benchmark failures justify it.

## ADR-006 — Never execute repository code
No installs, tests, builds, or scripts in cloned repos.

## ADR-007 — PostgreSQL + pgvector
One database for structured state and vector retrieval.

## ADR-008 — Push dashboard, not chat
Initial scan + scheduled scan + report UI.

## ADR-009 — Suppress unchanged scans
Stable finding fingerprint prevents repetitive alerts.

## ADR-010 — MCP remains deferred
MCP is a possible future integration, not part of the current measured core.

## ADR-011 — CVE feeds are stretch only
Avoid turning this into security/dependency management.

## ADR-012 — AgentCore remains deferred
Consider it only when it solves a measured deployment need without weakening the core.

## ADR-013 — Benchmark before feature expansion
Build the 15 cases before adding more AWS services/rules.

# 0001 — Cloud Provider

**Status:** Accepted  
**Date:** 2026-07-07

## Decision
GCP

## Rationale
GCP chosen for straightforward containerized deployment and Cloud SQL integration for a NestJS application.

## Alternatives considered
- AWS — considered as a viable alternative, but GCP was selected for this project.

## Source
- [apps/api/README.md](../apps/api/README.md) mentions AWS deployment guidance for NestJS, but it does not establish the project’s final provider choice.
- [docs/tasks/TASK-004-agent-prompt.md](../docs/tasks/TASK-004-agent-prompt.md) includes both AWS and GCP deployment paths, which made the decision ambiguous until confirmed.

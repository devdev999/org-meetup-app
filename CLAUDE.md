# org-meetup-app

A multi-organisation staff meetup platform. Design vocabulary lives in `CONTEXT.md` and decisions in `docs/adr/`; read both before working in an area.

## Agent skills

### Issue tracker

Issues and specs live as GitHub Issues on devdev999/org-meetup-app, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, unchanged: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Code

TypeScript, Next.js, Drizzle, pg-boss, Postgres (ADR 0005). Layout, module boundaries and how to run things: `README.md`. `src/application` is the one deep module: import only its root files (`index.ts`, `ports.ts`), never `lib/`; tests cross its interface as an actor and never read tables. `pnpm check` runs typecheck, boundary lint and the tests (Postgres needed: `docker compose up -d postgres`).

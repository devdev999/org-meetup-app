# org-meetup-app

A multi-organisation staff meetup platform. Design vocabulary lives in `CONTEXT.md` and decisions in `docs/adr/`; read both before working in an area.

## IMPORTANT
- Keep all code minimally viable, readable and simply maintainable.
- Do not add any comments in code unless there are multiple chains, extremely complex logic or major architecture decisions there
- Be concise in your prose and keep things simple, do not overconvolute
- Always read and apply the [unslop skill](.agents/skills/unslop/SKILL.md) to every response and any text you write or edit.
- For every implementation task, create a feature branch from the latest `origin/main`, implement and run required tests, commit before reviewing, then push and open a draft GitHub PR targeting `main` with the issue/spec link and test results; obtain an independent review against the PR base and spec, address findings and push fixes, and require passing CI and explicit human approval before merging—never commit or push directly to `main`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub Issues on devdev999/org-meetup-app, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, unchanged: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Code

TypeScript, Next.js, Drizzle, pg-boss, Postgres (ADR 0005). Layout, module boundaries and how to run things: `README.md`. `src/application` is the one deep module: import only its root files (`index.ts`, `ports.ts`), never `lib/`; tests cross its interface as an actor and never read tables. `pnpm check` runs typecheck, boundary lint and the tests (Postgres needed: `docker compose up -d postgres`).

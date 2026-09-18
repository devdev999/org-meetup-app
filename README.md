# org-meetup-app

Staff of an organisation find colleagues who share their interests or can trade skills, and arrange to meet. Serves many Organisations, each sealed from the others.

- Vocabulary: [`CONTEXT.md`](./CONTEXT.md). Its terms are binding in code, tests and screens.
- Decisions: [`docs/adr/`](./docs/adr/).
- Spec and tickets: GitHub issues on `devdev999/org-meetup-app`; the v1 spec is issue #1.

## Run it locally

Needs Docker.

```sh
docker compose up --build
```

Then open <http://localhost:3000>. Compose starts Postgres, applies migrations and seeds the first Organisation ("Ministry A") with its first Platform Admin, then starts the web process and the worker. Sign-in goes through the built-in fake issuer (`IDENTITY_PROVIDER=fake`): a page where you type who you are. Sign in as `pat@ministry-a.example` to be the seeded Platform Admin, or as anyone else to see an unknown login create a new Member. The Department and Site fields on that page stand in for the directory claims a real issuer would send; they add to the Organisation's lists, which a Member then chooses from on their profile.

The worker logs a heartbeat once a minute: `docker compose logs -f worker`.

## Develop

Needs Node 22.12 or newer (the containers use 24) and pnpm 10.

```sh
pnpm install
cp .env.example .env            # then edit if needed
docker compose up -d postgres   # published on localhost:5439
pnpm db:setup                   # migrations + bootstrap from BOOTSTRAP_* variables
pnpm dev                        # web on http://localhost:3000
pnpm worker:dev                 # in another terminal
```

Checks:

```sh
pnpm test              # tests, against real Postgres (creates throw-away databases)
pnpm typecheck         # next typegen + tsc
pnpm lint:boundaries   # module boundaries, see below
pnpm check             # all three
```

CI runs the same three checks, builds the web app and builds both container images on every push.

## Layout

```
src/
  application/        the application module: all behaviour, one interface
    index.ts          entry point: createApplication, the Application and actor interfaces, errors
    ports.ts          entry point: the ports (identity claims, clock) and their types
    lib/              implementation, private: schema, sign-in, actors, bootstrap
    tests/            tests at the interface, against real Postgres and the in-memory adapters
  adapters/           one production and one in-memory adapter per port
    identity/         oidc.ts (openid-client) and fake.ts (stateless fake issuer)
    clock/            system.ts and controllable.ts
  app/                the web process: Next.js pages, route handlers and server actions
  web/                web helpers: sealed cookies, sessions, the application instance
  worker/             the worker process: pg-boss queues and scheduled jobs
  config/             environment parsing and production wiring
  db/                 migrations runner and the one-shot setup script
  testing/            test support shared across modules: throw-away Postgres databases
drizzle/              generated SQL migrations; commit them
```

### The application module

One deep module holds every rule. Its interface is a set of commands and queries phrased in glossary terms. Anonymous calls (`signInOptions`, `beginSignIn`, `completeSignIn`) get someone signed in; after that everything goes through an actor, `asMember(memberId)`, whose Organisation the application fixes itself. Pages, route handlers and job handlers translate their input into one call and render the result. They contain no rules.

Only `index.ts` and `ports.ts` are importable from outside; `lib/` and `tests/` are private. `pnpm lint:boundaries` (dependency-cruiser, config in `.dependency-cruiser.cjs`) enforces this, plus: the application never imports an adapter or a process, and the web process and the worker never import each other.

Departments and Sites are the Organisation's lists. The login (directory data) and, from the roster ticket on, the Organisation Admin add to them; a Member only chooses from them.

### Ports and adapters

External dependencies are ports with two adapters each. Identity claims come from OpenID Connect in production and from `FakeIdentity` in tests and local runs. The clock is `SystemClock` in production and `ControllableClock` in tests. Postgres is not a port: tests run against a real one.

`FakeIdentity` is stateless: the "code" it hands back is the claims themselves, so it works across processes and lets one helper, `FakeIdentity.callbackUrl`, serve both tests and the development sign-in page at `/dev-idp/authorize`.

### Tests

Tests cross the application's interface as a specific actor and assert on what that actor can observe. They never read tables. Each test file gets its own freshly migrated database (`src/testing/test-database.ts`, wired by `src/application/tests/harness.ts`); tables are truncated between tests. Set `TEST_DATABASE_URL` to point tests at a different Postgres (default `postgres://postgres:postgres@localhost:5439/postgres`).

Two wiring smoke tests sit beside the code they wire: the production OIDC adapter against a stub issuer (`src/adapters/identity/tests`) and one heartbeat through the real queue (`src/worker/tests`).

## Configuration

All from the environment; see [`.env.example`](./.env.example).

| Variable            | Meaning                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | Postgres connection string.                                                                 |
| `APP_URL`           | Public base URL of the web process; builds the sign-in redirect URI.                        |
| `SESSION_SECRET`    | At least 32 characters; seals the session and pending-sign-in cookies.                      |
| `IDENTITY_PROVIDER` | `oidc` (default) for real issuers, `fake` for the built-in issuer. A production build (`NODE_ENV=production`) refuses `fake` unless `ALLOW_FAKE_IDENTITY=yes`, which compose sets for the local run. |
| `BOOTSTRAP_*`       | The first Organisation, its OIDC settings and claim mapping, and the first Platform Admin. Unset to skip. |

Per-Organisation OIDC settings (issuer, client id, client secret, claim mapping) are held in the database and seeded from `BOOTSTRAP_*` until the Platform Admin ticket replaces the bootstrap.

## Migrations

Edit `src/application/lib/schema.ts`, then:

```sh
pnpm db:generate     # writes drizzle/NNNN_name.sql; commit it
pnpm db:setup        # applies it locally
```

Every table except platform configuration carries `organisation_id`. The application derives the Organisation from the actor, never from input.

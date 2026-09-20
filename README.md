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

Then open <http://localhost:3000>. Compose starts Postgres, applies migrations and seeds the first Organisation ("Ministry A") with its first Platform Admin, Departments ("Finance", "Legal") and Site ("Harbour House"), then starts the web process and the worker. Sign-in goes through the built-in fake issuer (`IDENTITY_PROVIDER=fake`): a page where you type who you are. Sign in as `pat@ministry-a.example` to be the seeded Platform Admin, or as anyone else to see an unknown login create a new Member. The Department and Site fields on that page stand in for the directory claims a real issuer would send; they add to the Organisation's lists, which a Member then chooses from on their profile. Leave those fields blank to choose from the seeded lists after acknowledging the first-login notice.

The worker logs a heartbeat once a minute: `docker compose logs -f worker`.

Sign in as `olivia@ministry-a.example` for the seeded Organisation Admin. Open the admin area from the profile to upload a roster, manage Departments, Sites and Activities, or review unknown logins and the audit log. The Platform Admin account has no Organisation Admin access unless separately assigned that role.

### Roster uploads

The CSV must have `email,name,department,site` columns and may include `staff_identifier`. Column names ignore case, spaces, underscores and hyphens. Quoted values and UTF-8 byte-order marks are supported. Email and name are required in every row; Department, Site and staff identifier may be blank. The CSV adapter enforces a 1 MB limit on UTF-8 input after normalizing line endings, before parsing on both preview and commit.

Upload the complete Organisation roster, including the Organisation Admin and Platform Admin rows if they should retain access. The preview shows additions, changed fields and departures. Committing updates Members by email within the Organisation. Missing Members become Departed immediately. Their records remain, but their profiles disappear from Member views and their sessions and sign-ins are refused. A returning Member keeps the same identity and becomes Provisioned until their next login. A stale preview must be uploaded again before committing.

New Members are Provisioned and visible before first login. Sign-in makes them Active without replacing populated roster fields. Roster uploads can correct name, Department, Site and staff identifier for existing Members. The application accepts structured roster rows through `previewRoster` and `commitRoster`; CSV parsing lives in an adapter so directory sync can use those commands later.

Retired Departments and Sites disappear from profile choices. Existing assignments remain visible and can be kept or cleared. Roster imports and sign-in claims can still reference retired entries without making them selectable again. Renaming an entry updates all references. Each Organisation starts with coffee, lunch, walk, game, sport, learning session and other Activities. The Site-sharing table records the future sharing relationship; no application command or query uses it yet.

Organisation Admin access is checked for each command and query. Roster views, previews and unknown-login lists record the actor, view, filter and time in the audit log, as required by [ADR 0006](./docs/adr/0006-admins-see-individual-level-data.md). Each view records access; the filter is empty because these views have no filtering controls yet.

## Meetups

Open Meetups from your profile to create one, join one or manage one you Host. Physical Meetups default to the Host's Site as their audience, even when the Place is at another Site. Virtual Meetups default to the whole Organisation. The Host can instead choose a Site, the Organisation or invite-only. Invite-only Meetups are visible to their Host and invitees.

Meetup input, display and notices use UTC for this deployment. Configurable deployment time zones belong to issue #15. Existing Participants and waitlisted Members keep access if their profile Site changes, so they can still leave their Meetup.

Capacity includes the Host and must be between two and thirty. Joining a full Meetup adds the Member to its FIFO waitlist. Leaving or increasing capacity promotes the next Member and adds a notice to their inbox. Repeated joins do not take extra spots, and concurrent joins cannot overfill a Meetup.

The Host can edit the time, Place, duration, description and capacity, cancel, or hand over to a Participant. Handover keeps the previous Host as a Participant, who can then leave. Cancellation notifies Participants and the waitlist, clears the waitlist, and keeps the cancelled Meetup visible. Cancellation notices retain access for former waitlisted Members even after their Site changes. Started or cancelled Meetups cannot change. Participants see each other; only the Host sees the waitlist.

The inbox receives channel-neutral notices for joins, departures, promotions, time or Place changes, cancellations and handovers. Message content uses first names, Activity, time and Place. Member lifecycle effects on Meetups belong to issue #13.

The application stores Meetups and future Events together with a kind. All commands and queries derive the Organisation from the Member actor. Mutations use the same Organisation transaction lock as roster and admin changes, so seating and notices commit together.

## Notifications

### Invites

The Host can invite a Member of the same Organisation from any upcoming Meetup, including a Member who has not logged in yet. The Invite page searches names and shows twenty Members per page. Invitees can see that Meetup regardless of their Site, including after accepting, declining or expiry. The Host sees every Invite's state; each invitee sees only their own. Repeating an Invite keeps the existing state and sends no duplicate notice.

Invitees accept or decline in the app or through Telegram buttons. Accepting takes a free spot or moves the Member to the front of the waitlist, including an existing waitlisted Member. Each new acceptance goes ahead of earlier waitlisted acceptances. Repeating the same answer leaves places and notices unchanged; a different answer after responding is refused. Declining keeps a place or waitlist entry obtained by joining an open Meetup, and the Host's notice explains that the Member remains. Leave separately to withdraw. After leaving, retrying an old Accept button explains that the Member no longer has a place.

Pending invitees receive time, Place, handover and cancellation notices. Cancellation expires pending Invites immediately. The worker expires unanswered Invites at the current start time, checking every minute, and answers are refused from that time even before the worker runs. An Invite does not expire at an old start time after the Host reschedules. Accepted and declined Invites retain their states.

### Delivery

Open **Notification settings** from the profile or inbox. Members can enable Telegram and email independently for each notice kind, including urgent kinds. Both preferences start enabled. Every notice remains in the inbox, and Telegram delivery also requires a linked account.

The app creates a single-use Telegram link valid for ten minutes. Open it and press Start in a private chat, then refresh the link status in the app. Creating another link invalidates the previous code. A Telegram account can belong to only one Member across the deployment. Unlinking removes the binding and pending link codes. Telegram buttons join a Meetup through the same Member command as the web app, including its access and capacity checks.

Enabled Telegram notices arrive immediately. Email for new and accepted Invites, joins, waitlist promotions, cancellations and time, duration or Place changes also arrives immediately. Other email notices, including declined Invites, batch into the next daily digest at 09:00 UTC. Delivery preferences are checked again before a retry or digest. Provisioned Members can receive email before first login. Departed and Suspended Members receive no external notices.

Notices and pending deliveries are saved with the Meetup change. Sending runs after that transaction commits and outside any transaction, so a slow provider holds no database connection. While sending, the process renews its one-minute lease every twenty seconds. Only the owning claim can renew or settle a delivery. A member action sends only its own Meetup's notices; the worker delivers the rest and checks for retries and due digests every minute. A failed delivery retries each minute and is given up after 15 attempts, after which it stays queryable but is no longer retried, while the inbox keeps every notice. Completed deliveries are not replayed. A process failure after provider acceptance, or an interruption that prevents lease renewal for a full minute, can still cause a duplicate. Telegram has no server-side key to prevent it.

Telegram messages contain first names, Activity, UTC time and the physical Place name. Virtual Places appear as "Online" on Telegram so room URLs cannot disclose personal information, while email carries the meeting URL so an email-only Member can join. Telegram buttons contain an action and an opaque Meetup or Invite identifier. Profiles, Interests, Departments and descriptions are not added to messages.

### Channel configuration

`TELEGRAM_PROVIDER=memory` and `EMAIL_PROVIDER=memory` are the defaults. The memory adapters make no outbound requests. Supply production settings to both the web process and the worker.

| Variable | Value |
| --- | --- |
| `TELEGRAM_PROVIDER` | `memory` or `telegram`. |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@`. Required for Telegram; optional for local link testing with memory. |
| `TELEGRAM_BOT_TOKEN` | Bot token, required for Telegram. |
| `TELEGRAM_WEBHOOK_SECRET` | A secret of 16 to 256 letters, digits, underscores or hyphens. Required for Telegram. |
| `EMAIL_PROVIDER` | `memory` or `smtp`. |
| `SMTP_URL` | SMTP connection URL with any credentials, such as `smtps://sender:password@smtp.example:465`. Required for SMTP. |
| `EMAIL_FROM` | Sender email address, required for SMTP. |

Register the public HTTPS URL `<APP_URL>/api/telegram` with Telegram's [setWebhook method](https://core.telegram.org/bots/api#setwebhook). Set `secret_token` to `TELEGRAM_WEBHOOK_SECRET` and `allowed_updates` to `["message", "callback_query"]`. The endpoint checks the secret header before processing an update. Group chats and messages whose sender differs from the private chat are ignored.

## Interests and finding Members

Open **Your Interests** from your profile. Enter a phrase, choose Skill or Hobby, and choose Shares or Seeks. The preview shows the proposed canonical Interest. Confirm it, choose another shortlisted Interest, or keep your phrase. Saving retains the original phrase as an Alias and replaces any previous Stance for that Interest.

Each Organisation starts with SQL, Rust, public speaking and spreadsheets as Skills, and board games, bouldering and running as Hobbies. Interests and Aliases belong to one Organisation. If the AI endpoint fails or returns an invalid answer, text similarity still produces a preview for confirmation. Previewing never saves a declaration.

An Alias maps to one Interest per Organisation, ignoring case and surrounding whitespace. Reusing it for that Interest retains the latest typed spelling. A conflicting mapping fails without saving a declaration or a new Interest. A new selection that collides with an existing canonical name must match its spelling and kind, or the Member must preview and confirm again. The preview shows the existing Interest when an AI proposal uses its name.

Migration `0004` backfills normalized Alias keys. If an existing development database contains duplicate keys, the migration stops without removing Aliases. Reconcile those mappings before rerunning it.

Open **Find Members** to search your Organisation by Interest, Department and Site. Interest search includes remembered Aliases. Results and profiles group Skills and Hobbies with their Stances. Provisioned Members appear before first login; Departed and Suspended Members do not appear.

An Organisation Admin's Member searches and profile views also create audit records. Each record includes the actor, time, and effective search filters or target Member. If recording access fails, the query returns no data.

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

Before acknowledgement, a Member can query `adminVisibilityNotice()` for the welcome page and call `acknowledgeAdminVisibilityNotice()`. The application refuses protected Member commands and `organisationAdmin()` with `AdminVisibilityNoticeRequiredError` until then; the web translates that error into a redirect. The notice query returns nothing once acknowledged, and repeat acknowledgements retain the original timestamp.

Departments and Sites are the Organisation's lists. Bootstrap configuration, login directory data, roster uploads and the Organisation Admin add to them; a Member only chooses from them. A Member's corrections, including clearing a populated field to "Not set", survive later logins. Saving one field leaves an untouched blank in the other eligible for later login data.

### Ports and adapters

External dependencies are ports with two adapters each. Identity claims come from OpenID Connect in production and from `FakeIdentity` in tests and local runs. The clock is `SystemClock` in production and `ControllableClock` in tests. Postgres is not a port: tests run against a real one.

`FakeIdentity` is stateless: the "code" it hands back is the claims themselves, so it works across processes and lets one helper, `FakeIdentity.callbackUrl`, serve both tests and the development sign-in page at `/dev-idp/authorize`.

### Tests

Tests cross the application's interface as a specific actor and assert on what that actor can observe. They never read tables. Each test file gets its own freshly migrated database (`src/testing/test-database.ts`, wired by `src/application/tests/harness.ts`); tables are truncated between tests. Set `TEST_DATABASE_URL` to point tests at a different Postgres (default `postgres://postgres:postgres@localhost:5439/postgres`).

Wiring smoke tests cover the production OIDC adapter against a stub issuer, a Telegram webhook through the application and reply, and heartbeat and digest jobs through the real queue. Telegram and SMTP adapter tests use local protocol servers and send no real messages.

## Configuration

All from the environment; see [`.env.example`](./.env.example).

| Variable            | Meaning                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | Postgres connection string.                                                                 |
| `APP_URL`           | Public base URL of the web process; builds the sign-in redirect URI.                        |
| `SESSION_SECRET`    | At least 32 characters; seals the session and pending-sign-in cookies.                      |
| `IDENTITY_PROVIDER` | `oidc` (default) for real issuers, `fake` for the built-in issuer. A production build (`NODE_ENV=production`) refuses `fake` unless `ALLOW_FAKE_IDENTITY=yes`, which compose sets for the local run. |
| `BOOTSTRAP_*`       | The first Organisation, its OIDC settings and claim mapping, and the first Platform Admin. Unset to skip. |
| `BOOTSTRAP_DEPARTMENTS`, `BOOTSTRAP_SITES` | Optional JSON arrays of names to seed the Organisation's profile choices, such as `["Finance","Legal"]` and `["Harbour House"]`. |
| `BOOTSTRAP_ORGANISATION_ADMIN_EMAIL`, `BOOTSTRAP_ORGANISATION_ADMIN_NAME` | Optional first Organisation Admin. Set both together. This role is separate from Platform Admin. |

Supply these lists when the issuer does not provide Department or Site claims, so Members still have profile choices. Names are trimmed and matched ignoring case. Re-running `pnpm db:setup` adds new choices without removing existing ones or changing a Member's selections. Unset lists default to empty; blank names or malformed JSON are rejected. Compose supplies sample lists, and `.env.example` shows the format for local development.

Per-Organisation OIDC settings (issuer, client id, client secret, claim mapping) are held in the database and seeded from `BOOTSTRAP_*` until the Platform Admin ticket replaces the bootstrap. The client authenticates at the token endpoint with `client_secret_basic` when the issuer advertises it or advertises nothing, otherwise `client_secret_post`; a client without a secret relies on PKCE alone. A login whose claims carry `email_verified: false` is refused; an absent claim is accepted because the issuer is the Organisation's own directory.

`pnpm db:setup`, `pnpm worker` and `pnpm worker:dev` read `.env` when it exists (Node's `--env-file-if-exists`), as `next dev` does; variables already in the environment win.

### AI configuration

`AI_PROVIDER=memory` is the default. It makes no outbound requests and provides deterministic Interest resolution for local development and tests. Set `AI_PROVIDER=chat-completion` in production and supply `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`. The base URL must include the provider's API prefix, such as `https://chat.example/v1`. The adapter appends `/chat/completions`, authenticates with a bearer key, and requests a JSON object through the [Chat Completions protocol](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). The chosen endpoint and model must support JSON mode.

To check a configured endpoint, set `AI_CONTRACT_TEST=yes` and the three `AI_*` connection variables in the shell, then run `pnpm test src/adapters/ai/tests/live-contract.test.ts`. This makes three live requests using fixed Interest phrases. The contract tests skip unless explicitly enabled with credentials.

The AI receives only the typed Interest phrase and shortlisted Interest names, kinds and counts. It receives no Member or Organisation identifiers or profile fields. Requests time out after five seconds. If the provider fails, refuses, or returns an invalid result, the application uses similarity matching and still asks the Member to confirm. The production adapter lives in `src/adapters/ai/chat-completion.ts`; `MemoryAi` records requests and accepts scripted results or errors for application tests. An HTTP adapter test verifies the request and failure handling against a local stub endpoint.

## Migrations

Edit `src/application/lib/schema.ts`, then:

```sh
pnpm db:generate     # writes drizzle/NNNN_name.sql; commit it
pnpm db:setup        # applies it locally
```

Apply migrations before deploying the code that needs them: both the web and worker processes query the columns a migration adds, so new code on the old schema fails every worker tick. The migrations are additive, so rolling back to the previous code leaves the new columns unused rather than broken.

Every table except platform configuration carries `organisation_id`. The application derives the Organisation from the actor, never from input.

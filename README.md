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

Then open <http://localhost:3000>. Compose starts Postgres, applies migrations and creates the platform owner's Organisation, "Ministry A", and its first Platform Admin. Sign in as `pat@ministry-a.example` through the built-in fake issuer, then open Platform Admin from the profile. Appoint the first Organisation Admin for Ministry A, or create another Organisation with its issuer and first Organisation Admin. Each Organisation receives starter Interests and Activities.

The fake issuer lets you type who you are. Its Department and Site fields stand in for directory claims and add names to the Organisation's lists. An Organisation Admin can also manage those lists, upload a roster and review unknown logins. Platform Admin access alone grants no Organisation Admin role.

The worker logs a heartbeat once a minute: `docker compose logs -f worker`.

### Roster uploads

The CSV must have `email,name,department,site` columns and may include `staff_identifier`. Column names ignore case, spaces, underscores and hyphens. Quoted values and UTF-8 byte-order marks are supported. Email and name are required in every row; Department, Site and staff identifier may be blank. The CSV adapter enforces a 1 MB limit on UTF-8 input after normalizing line endings, before parsing on both preview and commit.

Upload the complete Organisation roster, including the Organisation Admin and Platform Admin rows if they should retain access. The preview shows additions, changed fields and departures. Committing updates Members by email within the Organisation. Missing Members become Departed immediately. Their records remain, but their profiles disappear from Member views and their sessions and sign-ins are refused. A returning Member keeps the same identity and becomes Provisioned until their next login. A stale preview must be uploaded again before committing.

New Members are Provisioned and visible before first login. Sign-in makes them Active without replacing populated roster fields. Roster uploads can correct name, Department, Site and staff identifier for existing Members. The application accepts structured roster rows through `previewRoster` and `commitRoster`; CSV parsing lives in an adapter so directory sync can use those commands later.

Retired Departments and Sites disappear from profile choices. Existing assignments remain visible and can be kept or cleared. Roster imports and sign-in claims can still reference retired entries without making them selectable again. Renaming an entry updates all references. Each Organisation starts with coffee, lunch, walk, game, sport, learning session and other Activities. The Site-sharing table records the future sharing relationship; no application command or query uses it yet.

Organisation Admin access is checked for each command and query. Roster views, previews and unknown-login lists record the actor, view, filter and time in the audit log, as required by [ADR 0006](./docs/adr/0006-admins-see-individual-level-data.md). Each view records access; the filter is empty because these views have no filtering controls yet.

## Interest administration

Organisation Admins open **Interests** to find duplicate Interests, approve a surviving Interest, rename an Interest or change its kind. The worker checks each Organisation daily at 02:00 UTC. Both paths send only Interest names and counts of Active and Provisioned Members to the configured extraction model, including identifying text in typed or renamed Interests. No Member identifiers, attributes or Organisation identifiers accompany the request. The same set of Interest identifiers is proposed only once, including after a split.

A merge repoints Aliases, personal Stances and relevant Interests on Meetups, Events, pending Event proposals and recurring schedules. The most recent explicit declaration wins, including a same-value Stance command. Members see the survivor; an old form must reload before saving a removed Interest. The merge retains the original declarations and their order, and does not change the affected Members' first declaration dates or last activity.

**Merge history** provides the split action. Untouched declarations and attachments recover their originals. A later Stance edit stays on the survivor, and a later removal stays removed. Removing and adding an Interest again counts as a new choice. Editing an unrelated Meetup or Event field or adding another relevant Interest preserves the unaffected attachments. New occurrences created during a merge keep the Interests they received; after a split, future generation uses the restored series.

Approving a recurring Event proposal during a merge carries its original Interest choices into the new series. A later split restores those choices for future occurrences too.

Split a later merge involving the same Interests first. Unrelated merges remain independent. Hidden Interests retain their names for restoration, so those names cannot be reused while merged. Migration preserves old declarations with unknown order; ties prefer the survivor's Stance, then the lowest Interest identifier. All originals remain available for an untouched split. See [ADR 0013](./docs/adr/0013-interest-splits-preserve-later-choices.md).

Members can remove a personal declaration from **Your Interests**. This leaves the shared Interest catalog and any Meetup or Event attachments intact.

## Meetups

Open Meetups from your profile to create one, join one or manage one you Host. Physical Meetups default to the Host's Site as their audience, even when the Place is at another Site. Virtual Meetups default to the whole Organisation. The Host can instead choose a Site, the Organisation or invite-only. Invite-only Meetups are visible to their Host and invitees.

Meetup input, display and new notices use the configured deployment time zone, initially UTC. Existing Participants and waitlisted Members keep access if their profile Site changes, so they can still leave their Meetup.

Capacity includes the Host and must be between two and thirty. Joining a full Meetup adds the Member to its FIFO waitlist. Leaving or increasing capacity promotes the next Member and adds a notice to their inbox. Repeated joins do not take extra spots, and concurrent joins cannot overfill a Meetup.

The Host can edit the time, Place, duration, description and capacity, cancel, or hand over to a Participant. Handover keeps the previous Host as a Participant, who can then leave. Cancellation notifies Participants and the waitlist, clears the waitlist, and keeps the cancelled Meetup visible. Cancellation notices retain access for former waitlisted Members even after their Site changes. Started or cancelled Meetups cannot change. Participants see each other; only the Host sees the waitlist.

The inbox receives channel-neutral notices for joins, departures, promotions, time or Place changes, cancellations and handovers. Message content uses first names, Activity, time and Place. Member lifecycle effects on Meetups belong to issue #13.

The application stores Meetups and Events together with a kind. All commands and queries derive the Organisation from the Member actor. Mutations use the same Organisation transaction lock as roster and admin changes, so seating and notices commit together.

### Recurring Meetups and RSVP

Choose Weekly, Fortnightly or Monthly when creating a Meetup. The first start sets its weekday and local time in the deployment calendar. Monthly repeats on the same numbered weekday, and a fifth-weekday series skips months without one. The optional end date includes that whole local day. Each series keeps its creation time zone after a deployment setting changes. Daylight-saving transitions choose the earlier repeated time or shift a skipped time forward for that occurrence. Date inputs reject skipped or repeated times; choose another time for the first occurrence.

The worker creates ordinary occurrences fourteen days ahead. Each inherits the original series fields, relevant Interests and standing Participants. Editing, handing over or cancelling one occurrence affects that occurrence only. Its original scheduled slot stays recorded, so the worker does not create it again. The Recurring Meetups list keeps series controls available between monthly occurrences.

Standing places include the series Host and are capped by its capacity. Joining the series takes a place in each generated future occurrence or joins its FIFO waitlist when full. Leaving removes future places, waitlist entries and answers, promotes the next waiting Member, and preserves past participation.

Each standing Participant receives an RSVP prompt forty-eight hours before the occurrence, in the inbox and on enabled Telegram and email channels. A Member joining inside that window receives the prompt on the next worker run. Going and Not going buttons appear in the app and on Telegram. Not going frees this occurrence's place and keeps the standing place. Going again takes an available place or joins the ordinary waitlist without displacing anyone. The Host sees each answer and the waitlist separately. Joining a one-off counts as Going, including existing Meetups created before the RSVP migration.

Only the series Host can stop the series. This cancels its future occurrences and sends ordinary cancellation notices, including to Members who answered Not going. Started occurrences keep their history. Each worker run shares the Organisation lock with Member actions; occurrence generation and prompts are deduplicated across retries.

## Events

Open Events from your profile or home to propose one. A proposal stays private to its proposer and Organisation Admins until approval. The Organisation Admin queue records approval or rejection, with a required rejection note and an optional approval note. The proposer sees the decision under Your Event proposals and becomes Host on approval. Approval rechecks the start time, Activity, Sites, proposer and selected invitees before publishing. It creates the first occurrence, standing membership and selected Invites together. If an invitee has become ineligible, the Organisation Admin can reject with a note asking the proposer to submit again with eligible invitees. Rejected proposals create none of these.

The proposer keeps the decision and note if they later lose access to the published Event. Proposal history shows its current details only while the Event remains visible to them.

Organisation Admins can create an Event directly or reassign the Host of any published occurrence, including past and cancelled Events. Reassignment changes that occurrence's Host without changing participation, the original proposer or the series Host. A new Host can explicitly join a future occurrence, subject to its capacity.

Stopping a series also sends a cancellation notice to each occurrence's current Host, including a reassigned Host who has not joined it.

Events default to the whole Organisation and have no capacity limit unless one is supplied. A limit must be a positive whole number and includes the Host. Joining, FIFO waitlists, Invites, occurrence edits, recurrence and RSVP use the same rules as Meetups. Relevant Interests, automatic extraction and Suggestions also work on proposals and direct creation. Selected Invites on a proposal wait for approval. Event labels, inbox links, Telegram actions and email subjects identify Events separately. Delivery preferences apply to both kinds.

The schema includes an Event-to-Organisation sharing relationship for ADR 0002. No command or query uses it to grant cross-Organisation access.

## Suggestions

The home page suggests up to twenty open, unjoined Meetups in your scope over the next fourteen days. It ranks overlap with the Host's declarations and saved relevant Interests before start time and shows the reasons. Broad Activity names and descriptions are not ranking inputs.

Hosts can select up to twenty relevant Interests while creating or editing a Meetup. Creation also extracts proposals from the selected Activity and description. Review or remove these before Create, including any proposed new Interests. Manual choices survive extraction reruns, and a failed or empty extraction leaves creation available. Saving relevant Interests never changes personal Shares or Seeks.

Creation and editing show up to twenty suggested invitees. Candidates must be Active in the Host's Organisation and, for physical Meetups, based at the Place's Site. Hosts, current Participants and pending invitees are excluded. Creation lets the Host select Invites to send with the normal Create confirmation. Editing offers immediate one-tap Invites based on the saved Interests and Place. Confirmation rechecks the candidate's eligibility if their profile or the Place has changed.

The pure ranker gives compatible Member Interest overlap two points and Seeks with Seeks one point. Each overlap with a saved relevant Interest adds two points regardless of Stance. Invitee ties prefer a Member without a recorded Connection, then a different known Department, then an order seeded for that Meetup. Home uses the same Interest weights, then fewer Connections with Participants, then the soonest start. Connection counts come from confirmed Attendance. Each connected Member counts once, even across repeated occurrences. Waitlisted Members and Hosts without a seat do not add to an occurrence's count. Queries compute Suggestions each time; only the confirmed relevant Interests and Invites are saved.

## Attendance and Connections

After a Meetup or Event ends, the worker prompts its current Host to record Attendance. The prompt appears in the inbox and on enabled Telegram and email channels. The Host ticks who came, including themselves only if they came. A Host without a seat can still record Attendance. Reassigned Hosts stay in the checklist and count as present only when ticked. Telegram's "Everyone came, including me" button confirms the whole checklist. Use the app to record a subset or amend a confirmation.

Confirmation and amendments close seven days after the occurrence ends. A changed Host receives a new prompt while Attendance remains unconfirmed. Older Telegram buttons cannot overwrite a confirmation, amendment or newer Host prompt. Unchanged repeated confirmations send no duplicate notices. Participants receive a generic notice when Attendance is recorded or amended; it includes no individual outcome.

Members ticked present gain a Connection with each other. **Your Connections** lists each Member and the supporting occurrences with their dates, Activities and Places. Amendments change only that occurrence's evidence. Another shared occurrence preserves its Connection and history. Suspended and Departed Members remain in this history, with no link to their hidden profiles.

Only seated Participants who were Going can become no-shows. Waitlisted, Not going and No answer Members do not. Without a confirmation, Attendance stays unknown even after seven days. Members see their own outcome in **Your Attendance history**. Organisation Admins can read an individual's history through **Attendance and ratings**, and every such view enters the audit log. Ordinary Members cannot read each other's outcomes.

Each seated Participant can rate an ended occurrence once, from one to five, even if Attendance is unknown. Ratings have no seven-day deadline and cannot be changed. Organisation Admins see only the count and average by Activity. These rules apply separately to each recurring Meetup and Event occurrence.

## Notifications

### Invites

The Host can invite a Member of the same Organisation from any upcoming Meetup, including a Member who has not logged in yet. The Invite page searches names and shows twenty Members per page. Invitees can see that Meetup regardless of their Site, including after accepting, declining or expiry. The Host sees each current Invite's state; each invitee sees only their own. Repeating an Invite keeps the existing state and sends no duplicate notice. A Suggestion can explicitly send a fresh Invite after a previous answer. Its new identifier prevents old Telegram buttons from answering it, and retrying that send does not send again.

Invitees accept or decline in the app or through Telegram buttons. Accepting takes a free spot or moves the Member to the front of the waitlist, including an existing waitlisted Member. Each new acceptance goes ahead of earlier waitlisted acceptances. Repeating the same answer leaves places and notices unchanged; a different answer after responding is refused. Declining keeps a place or waitlist entry obtained by joining an open Meetup, and the Host's notice explains that the Member remains. Leave separately to withdraw. After leaving, retrying an old Accept button explains that the Member no longer has a place.

Pending invitees receive time, Place, handover and cancellation notices. Cancellation expires pending Invites immediately. The worker expires unanswered Invites at the current start time, checking every minute, and answers are refused from that time even before the worker runs. An Invite does not expire at an old start time after the Host reschedules. Accepted and declined Invites retain their states.

Time, duration and Place edits supersede older pending edit deliveries. Invite retries keep their own delivery preferences and original sender while using the current Activity, time and Place. Both Invite and edit notices keep Telegram Accept and Decline buttons for a pending Invite. Earlier inbox notices remain as history.

### Delivery

Open **Notification settings** from the profile or inbox. Members can enable Telegram and email independently for each notice kind, including urgent kinds. Both preferences start enabled. Every notice remains in the inbox, and Telegram delivery also requires a linked account.

The app creates a single-use Telegram link valid for ten minutes. Open it and press Start in a private chat, then refresh the link status in the app. Creating another link invalidates the previous code. A Telegram account can belong to only one Member across the deployment. Unlinking removes the binding and pending link codes. Telegram buttons join a Meetup through the same Member command as the web app, including its access and capacity checks.

Enabled Telegram notices arrive immediately. Email for new and accepted Invites, joins, waitlist promotions, cancellations, RSVP and Attendance prompts, Availability overlaps and time, duration or Place changes also arrives immediately. Other email notices, including declined Invites and Attendance confirmations, batch into the next daily digest at 09:00 in the deployment time zone. Delivery preferences are checked again before a retry or digest. Provisioned Members can receive email before first login. Departed and Suspended Members receive no external notices.

Notices and pending deliveries are saved with the Meetup change. Sending runs after that transaction commits and outside any transaction, so a slow provider holds no database connection. While sending, the process renews its one-minute lease every twenty seconds. Only the owning claim can renew or settle a delivery. A member action sends only its own Meetup's notices; the worker delivers the rest and checks for retries and due digests every minute. A failed delivery retries each minute and is given up after 15 attempts, after which it stays queryable but is no longer retried, while the inbox keeps every notice. Completed deliveries are not replayed. A process failure after provider acceptance, or an interruption that prevents lease renewal for a full minute, can still cause a duplicate. Telegram has no server-side key to prevent it.

Telegram messages contain first names, Activity, time with its zone and the physical Place name. Virtual Places appear as "Online" on Telegram so room URLs cannot disclose personal information, while email carries the meeting URL so an email-only Member can join. Telegram buttons contain an action and an opaque Meetup or Invite identifier. Profiles, Interests, Departments and descriptions are not added to messages.

### Channel configuration

`TELEGRAM_PROVIDER=memory` and `EMAIL_PROVIDER=memory` are the defaults. The memory adapters make no outbound requests. Supply production settings to both the web process and the worker.

| Variable | Value |
| --- | --- |
| `TELEGRAM_PROVIDER` | `memory` or `telegram`. |
| `TELEGRAM_BOT_USERNAME` | Initial bot username without `@`. Later edited in Platform Admin settings. |
| `TELEGRAM_BOT_TOKEN` | Bot token, required for Telegram. |
| `TELEGRAM_WEBHOOK_SECRET` | A secret of 16 to 256 letters, digits, underscores or hyphens. Required for Telegram. |
| `EMAIL_PROVIDER` | `memory` or `smtp`. |
| `SMTP_URL` | SMTP connection URL with any credentials, such as `smtps://sender:password@smtp.example:465`. Required for SMTP. |
| `EMAIL_FROM` | Initial sender email address. A sender must be configured in Platform Admin settings before email can send. |

Register the public HTTPS URL `<APP_URL>/api/telegram` with Telegram's [setWebhook method](https://core.telegram.org/bots/api#setwebhook). Set `secret_token` to `TELEGRAM_WEBHOOK_SECRET` and `allowed_updates` to `["message", "callback_query"]`. The endpoint checks the secret header before processing an update. Group chats and messages whose sender differs from the private chat are ignored.

## Availability

Open **Availability** from home, your profile or Meetups to post an Activity and a window today. Physical posts use your current Site. Virtual posts are visible across your Organisation. Only open windows from Active Members appear. Suspension or departure closes a Member's posts. A Site change or retirement closes affected physical posts, and retiring an Activity closes its posts. Earlier overlaps remain in reports. The page refreshes while open and removes posts when their windows end.

Matching Activities with intersecting windows at the same Site, or both virtual, produce Suggestions for both Members. Each pair receives one overlap notice per deployment calendar day, even across multiple posts or Activities. The inbox always receives it. Enabled Telegram and email notices send immediately through the existing delivery queue and retry policy. The worker checks newly open windows and expires ended windows every minute.

**Plan a Meetup** opens the ordinary creation form with the Activity, overlap start and Site or virtual setting filled in. Choose a future start within the overlap window, supply the physical spot or virtual URL, and review duration, capacity and audience. Only confirmation saves a Meetup and sends the other Member an Invite. Confirmation rechecks the overlap, Activity, Site and start time in the same transaction as creation.

After linking Telegram, send `/available`. Tap an Activity, then a 30- or 60-minute window at your Site or virtually. Window choices expire after ten minutes, and windows end by midnight in the deployment time zone. Repeating the same choice preserves the existing post.

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
pnpm db:setup                   # migrations, lifecycle cleanup and first Platform Admin setup
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

CI runs the same three checks, builds the web app, runs the browser smoke test and builds both container images on every push.

## Reports and audit

The Organisation Admin area opens Reports. Select an inclusive date period in the deployment time zone for weekly Meetup and Event totals, participation, RSVP and Attendance, waitlists, Availability, activation and ratings. Interest demand and Telegram linkage show current Active Members. Each table states its basis and exports the same figures as CSV.

Participation uses current Active Members and their current Department and Site, even for an earlier period. The numerator counts Members with confirmed Attendance in that period. Suspended and Departed Members remain in individual history but do not count in this participation population.

Activation cohorts use initial provisioning in the selected period. Both the first declared Interest and first confirmed Attendance must fall within thirty days of that original date. Attendance uses the occurrence start time; joining or a Going answer alone does not qualify. Reactivation does not restart the window. Legacy declarations with no reliable first date remain unknown, including after reconfirmation. Waitlist frequency retains an occurrence's waitlist history after promotion or removal; older occurrences without surviving evidence show unknown history separately.

Organisation Admins can select any Member, including Suspended and Departed Members, for participation counts, Connections, Availability posts, Interests, Flags and last activity. Last activity records successful logins and explicit commands by that Member. Reads, automatic jobs and an Organisation Admin editing someone else do not update the target Member. Dates from before activity tracking remain unknown until a new action.

Every individual view and every export records its actor, action, filters and time. Organisation Admins see their own Organisation's audit entries. Platform Admins open their area from their profile and can view or export the cross-Organisation audit log. They see the actor's identity, but no viewed Member identity or personal filter values. Individual reports require the separate Organisation Admin role. CSV downloads quote text and protect formula-leading values.

## Layout

```
src/
  application/        the application module: all behaviour, one interface
    index.ts          entry point: createApplication, the Application and actor interfaces, errors
    ports.ts          entry point: the ports (identity claims, clock) and their types
    lib/              implementation, private: schema, sign-in, actors, setup
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

Application tests cross the interface as a specific actor and assert on what that actor can observe. They never read tables. The pure Suggestion ranker stays private, with focused tests beside it under `lib/`, as the parent spec requires. Each actor test file gets its own freshly migrated database (`src/testing/test-database.ts`, wired by `src/application/tests/harness.ts`); tables are truncated between tests. Set `TEST_DATABASE_URL` to point tests at a different Postgres (default `postgres://postgres:postgres@localhost:5439/postgres`).

Wiring smoke tests cover the production OIDC adapter against a stub issuer, a Telegram webhook through the application and reply, and heartbeat and digest jobs through the real queue. Telegram and SMTP adapter tests use local protocol servers and send no real messages.

The browser smoke test signs in two Members, declares their Interests, creates a Meetup and joins it from Suggestions. It checks manual Interest preservation, a saved automatic proposal, independent editing, and sending and renewing an Invite from Suggestions. Personal Stances stay unchanged. The test starts the production web build on port 3011 with a disposable database, fake identity and memory delivery adapters. Install Chromium once, then build and run it:

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test:browser
```

## Configuration

Secrets and process settings come from the environment; see [`.env.example`](./.env.example). Platform Admin settings store the non-secret AI endpoint, Scout model, Interest extraction model, Telegram bot username, email sender and time zone. The running web and worker processes read current settings for new operations. Environment defaults are copied once during setup and do not overwrite later UI changes.

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `APP_URL` | Public web URL used for sign-in callbacks. |
| `SESSION_SECRET` | At least 32 characters; seals session and pending-sign-in cookies. |
| `IDENTITY_PROVIDER` | `oidc` for real issuers, or `fake` for local development. Production refuses `fake` unless `ALLOW_FAKE_IDENTITY=yes`. |
| `OIDC_CREDENTIALS` | JSON mapping of credential references to installed OIDC client secrets. Supply it to web, worker and setup. |
| `BOOTSTRAP_*` | Creates only the first platform owner Organisation and Platform Admin. Unset all fields to skip. Later setup runs leave an existing owner unchanged. |
| `BOOTSTRAP_OIDC_CREDENTIAL_REF` | Optional installed credential reference for the initial owner issuer. Blank means a public client. |
| `AI_BASE_URL`, `AI_MODEL`, `AI_EXTRACTION_MODEL` | Initial AI endpoint, Scout model and small Interest model. An unset extraction model keeps `AI_MODEL`; when neither is set, both default to `gpt-5.6-luna`. |
| `AI_TOOL_PROTOCOL` | Scout tool protocol, `native` by default or `structured` for endpoints without native tool calls. |
| `TELEGRAM_BOT_USERNAME`, `EMAIL_FROM`, `TIME_ZONE` | Initial non-secret defaults. Time zone defaults to UTC. |

Open Platform Admin, then Organisations, to create an Organisation or appoint an existing Organisation's first Organisation Admin. Creation accepts issuer, client ID, claim mapping and an optional credential reference. Leave the reference blank only for a public client. A required reference with no installed secret shows "Sign-in awaiting OIDC credential". An operator installs that reference in `OIDC_CREDENTIALS` and restarts the services. The UI and database hold no OIDC secret value. Confidential clients use `client_secret_basic` or `client_secret_post`; public clients rely on PKCE. Sign-in rejects an explicit `email_verified: false` claim.

Ministries group Organisations for aggregate reports. Participation and rating totals use combined underlying counts and scores. Exact Department, Site and Activity names combine across Organisations; Interest names also require matching kinds. Unassigned groups stay separate from named groups, and Availability overlaps stay within an Organisation. Platform Admins see no individual Member report or export, and their audit view retains the redaction described above.

Retired `BOOTSTRAP_DEPARTMENTS`, `BOOTSTRAP_SITES` and Organisation Admin bootstrap fields are ignored. Manage those values through the app. `BOOTSTRAP_OIDC_CLIENT_SECRET` is rejected with instructions to use a credential reference.

`pnpm db:setup`, `pnpm worker` and `pnpm worker:dev` read `.env` when it exists (Node's `--env-file-if-exists`), as `next dev` does; variables already in the environment win.

### AI configuration

`AI_PROVIDER=memory` is the default. It makes no outbound requests and provides deterministic Interest resolution for local development and tests. Set `AI_PROVIDER=chat-completion` and install `AI_API_KEY` in the environment. Configure the endpoint and models through Platform Admin settings, or supply their initial environment defaults before first setup. The base URL must include the provider's API prefix, such as `https://chat.example/v1`. The adapter appends `/chat/completions`, authenticates with a bearer key, and requests a JSON object through the [Chat Completions protocol](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). The chosen endpoint and model must support JSON mode.

To check a configured endpoint, put `AI_CONTRACT_TEST=yes`, `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` in the ignored `.env`, then run `node --env-file=.env node_modules/vitest/vitest.mjs run src/adapters/ai/tests/live-contract.test.ts`. This checks canonicalisation, clustering and a Scout tool conversation in both protocols using synthetic data. The contract tests skip unless explicitly enabled with credentials.

Canonicalisation sends the typed Interest phrase and shortlisted Interest names, kinds and counts. Extraction sends the selected Activity name and description, then canonicalises each extracted phrase within the Member's Organisation. These texts may contain identifying information under ADR 0009. Requests time out after five seconds. Failed canonicalisation falls back to text similarity; failed extraction adds no Interests and leaves manual creation available.

Set the Interest extraction model independently of Scout in Platform Admin settings. Both extraction and canonicalisation use this small model. Initial setup keeps an existing `AI_MODEL` when `AI_EXTRACTION_MODEL` is unset; new deployments with neither value default to `gpt-5.6-luna`. Choose a supported model for the endpoint. Both operations require JSON mode. The production adapter lives in `src/adapters/ai/chat-completion.ts`; `MemoryAi` records requests and accepts scripted results or errors for application tests. HTTP adapter tests cover the request, invalid output and timeout behavior with a local stub endpoint.

### Scout

Members open Scout from Home to ask about current Availability, Members who Share or Seek an Interest, upcoming Meetups and Events, or their own Connections. Scout uses the same application queries as the normal screens, including their access checks, Suggestion reasons and admin audit records. It cannot create, join, invite or merge. Answers appear as plain text with links supplied by the application.

`AI_TOOL_PROTOCOL=native` uses Chat Completions function calls, one at a time. `structured` puts the same read definitions in the prompt and accepts one JSON request or answer per response. It does not require native tools or JSON mode for Scout. Both modes send identifying questions, earlier answers, arguments and authorized results under ADR 0009. Each completion times out after 30 seconds, and a question can make at most six completions. The memory provider supports the same protocols with deterministic replies for local testing.

Conversation history stays in the browser with a server signature, tied to the Member and valid for 30 minutes. Before reusing an answer, Scout repeats the reads that supported it. If their results or permissions change, it starts a new conversation. After six complete turns, the next question starts a new conversation too. Access and read results are checked again after each AI response. No database migration is needed for Scout.

## Upgrading existing Organisations to Platform Admin configuration

Before migration 0021, stop the web and worker and install each existing confidential issuer's secret in `OIDC_CREDENTIALS` under `legacy-<Organisation slug>`. Keep these values in the deployment's secret store and environment. The migration replaces stored secrets with those references and drops the secret column. Public clients keep a null reference. Remove the retired direct secret bootstrap variable, then run complete `pnpm db:setup` and restart both services at the new version. Check readiness on the Organisations page and complete a sign-in before reopening access.

The earliest-created Organisation with an existing Platform Admin becomes the platform owner, with Organisation slug as the tie-breaker. Platform Admin flags outside that owner are removed. Organisation Admin roles and Member identities remain unchanged. Existing series and pending Event proposals retain UTC calendars. Setup also performs the existing inactive-Member lifecycle cleanup. The schema change removes the old code's secret column, so use a forward fix rather than restarting the old version.

## Migrations

Edit `src/application/lib/schema.ts`, then:

```sh
pnpm db:generate     # writes drizzle/NNNN_name.sql; commit it
pnpm db:setup        # applies it locally
```

Apply migrations before starting the web and worker code that needs them. Check each migration's compatibility before upgrading or reverting an image.

Migrations `0011` and `0012` add Availability and allow notices without a Meetup. Earlier web and worker versions cannot read these notices safely. Stop every old web and worker instance before applying these migrations, then start both at the new version. Do not run mixed versions.

Migrations `0013` and `0014` add recurring Meetups and RSVP. Upgrade the web and worker together with the same stop, migrate and restart sequence. Once series or RSVP prompts exist, rollback to earlier images is unsupported because they cannot manage recurrence or deliver the correct RSVP actions. Deploy a forward fix.

Migration `0015` adds Event proposals and the unused sharing relationship, and makes occurrence and series capacity nullable for uncapped Events. Migration `0016` preserves the original Invite sender when retries refresh the Activity, time and Place, including existing Invites. Stop the web and worker, migrate, then restart both with this release. Existing Meetup capacities, participation, recurrence and notices are preserved. Once Events exist, earlier images cannot safely process them or display their actions, so deploy a forward fix instead of rolling back.

Migration `0017` adds Attendance confirmations, per-occurrence checklists and ratings. It preserves existing occurrences, proposals, participation, RSVP answers and notices. Stop the web and worker before migrating, then restart both at this release. Older versions cannot handle the new notice kinds and Telegram actions. Once Attendance notices exist, deploy a forward fix instead of rolling back.

Migration `0018` adds Flags and the prior Member status needed for reinstatement. Database setup also completes lifecycle cleanup for Members already Departed or Suspended before the upgrade. It cancels their upcoming hosted occurrences, stops their series, removes future places and queues notices for the worker. Past Attendance and Connections remain intact. Repeating setup is safe. Run the complete setup command before restarting the web and worker; applying SQL alone does not perform this cleanup.

Migration `0019` adds reporting facts for first Interest declaration, last activity and retained waitlist history. It preserves unknown legacy dates and histories instead of inventing them. Stop the web and worker, run complete database setup, then restart both. Keep versions together so commands continue recording these facts. The migration retains existing Member, occurrence, Attendance and moderation data.

Migration `0020` indexes retained Availability for reports. Complete setup closes outstanding posts that have lost Member, Site or Activity eligibility. For posts already ineligible before this release, setup records the closure at upgrade time. Earlier eligibility changes cannot be reconstructed. Repeating setup preserves the first recorded closure.

For an existing local Compose stack, leave Postgres running and run these steps in order. Continue only when each command succeeds:

```sh
docker compose build web setup
docker compose stop web worker
docker compose run --rm --no-deps setup
docker compose up -d --no-deps web worker
```

If setup fails, keep the web and worker stopped until it is resolved. Compose's setup dependency does not stop already-running processes during an upgrade. Once Availability notices exist, rollback to earlier images is unsupported; deploy a forward fix. Restoring a pre-upgrade database backup would lose changes made after that backup.

Organisation-owned tables carry `organisation_id`. The Organisation registry, Ministries and platform configuration are deployment-wide. Member and Organisation Admin operations derive their Organisation from the actor, never from input. Platform Admin operations authorize access before selecting Organisations or Ministries.

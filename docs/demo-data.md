# DSTA walkthrough data

This fixture uses public Programme Centre names and fictional Members, Places and gatherings. It does not represent DSTA staff, internal facilities, actual Events or endorsement. Every demo email ends in `@dsta.example.test`.

The Programme Centre names follow [DSTA's job seeker page](https://www.dsta.gov.sg/join-us/job-seeker). The app stores them as Departments, its existing term for a Member's organisational unit.

## Load the local database

Start the normal local stack and complete `pnpm db:setup` first. The seed expects the standard `ministry-a` Platform Admin, `pat@ministry-a.example`, and the local fake issuer at `APP_URL/dev-idp`.

```sh
pnpm db:seed:demo --local
```

The command defaults to the Compose database at `localhost:5439/org_meetup` and the app at `http://localhost:3000`. It reads `.env` when present. It refuses production mode, a configured real identity provider, non-loopback addresses and any database other than `org_meetup`. The seed always uses in-memory AI, identity, Telegram and email adapters. It disables external notices for every demo Member before creating any gatherings.

The command creates the separate `dsta-demo` Organisation through the application interface. It leaves other Organisations' data in place. The existing Platform Admin's login, notice acknowledgement and creation action appear in ordinary activity/audit records. It does not run deployment-wide lifecycle or scheduled jobs.

If `dsta-demo` already exists, the command exits without changing seed data. This protects recordings and any manual changes. A failed first run may leave a partial demo Organisation. A rerun also skips that Organisation; it does not attempt repair or deletion. Use a separate local database backup for resets. Dates are relative to the first run; rerunning does not move them forward. Availability lasts up to four hours or the end of the deployment's day, whichever comes first. Post a new window through the app for a later recording.

## Sign in for the walkthrough

Choose **DSTA demo** on the sign-in page. The fake issuer needs an email and name, with no password. Department and Site may be left blank because the roster already supplies them.

| Role | Name | Email |
| --- | --- | --- |
| Main Member | Aisha Rahman | `aisha.rahman@dsta.example.test` |
| Organisation Admin | Maya Tan | `maya.tan@dsta.example.test` |
| Full Meetup Host | Priya Nair | `priya.nair@dsta.example.test` |
| Recurring Meetup Host | Wei Ming Lim | `wei.ming.lim@dsta.example.test` |

## What is populated

- 30 Active Members across eight Programme Centres, with two Shares and one Seeks each.
- Eight upcoming Meetups: Severance lunch, K-drama lunch, Board games, Easy run, Photo walk, Python clinic, Sketch and kopi, and Badminton.
- Three published Events: Skill swap, New faces coffee and Repair cafe. Skill swap follows a Member proposal and Organisation Admin approval; New faces coffee has no capacity limit.
- One pending Green commute lunch proposal from Aisha, visible to Maya for approval.
- Three past Meetups with confirmed Attendance, some no-shows, ratings and Connections.
- A full four-person Board games Meetup with two Members on its waitlist.
- An Easy run series with standing Participants and different RSVP answers. The normal worker creates later occurrences.
- An unanswered K-drama lunch Invite and seven overlapping lunch Availability windows.

Meetup and Event descriptions begin with a short hook so they fit mobile cards. The Places are fictional. Public hobbies and toy datasets keep the fixtures suitable for a general staff walkthrough.

For a concise recording, sign in as Aisha and show Suggestions, Programme Centre filters, Shares and Seeks, a Meetup detail, the full Board games Meetup, Availability, and Connections. Sign in as Maya to show the pending Event and participation reports. The seed prints direct item IDs after creation.

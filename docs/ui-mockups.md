# Compare UI directions

Run the existing local setup in README.md, then `pnpm dev` and open [the UI preview](http://localhost:3000/prototype/ui).

- [Atrium](http://localhost:3000/prototype/ui?variant=atrium) follows the warm architectural reference, with a photographic feature, horizontal navigation and a weekly agenda.
- [Fieldwork](http://localhost:3000/prototype/ui?variant=fieldwork) uses a green navigation rail and a time-ordered Meetup list.
- [Studio](http://localhost:3000/prototype/ui?variant=studio) uses violet, a directory sidebar and a compact two-column index.

The bottom toolbar switches styles without losing the current screen or saved sample actions. Collapse it to inspect the complete layout. On mobile it starts as a compact Compare styles button. Left and right arrow keys also change styles when a form control or scrolling table is not focused. The screen selector exposes all 16 main screens. Administration has eight sections; Platform Admin has five.

The URL records the style, screen and selected record. Sample state remains in memory and resets on reload. Use Reset demo to start again.

## Scope

These are throwaway design mockups for [issue #42](https://github.com/devdev999/org-meetup-app/issues/42), on `feat/ui-style-mockups`. The route returns Not Found in a production build. Production routes, authentication, application commands and database records remain unchanged. No style has been selected for production.

The prototype's tokens and reusable controls are recorded in [DESIGN.md](../DESIGN.md) and its [component sidecar](../.impeccable/design.json).

The preview covers discovery, Meetups and Events, details, creation and Host editing, Members, profiles, Interests, Availability, Connections and Attendance history, inbox, notification preferences, Scout, Organisation Admin and Platform Admin. Administrative tables, sample decisions, empty states and forms use the same selected style.

All records and people are fictional. Actions change the preview or show explicit sample feedback. Scout returns scripted answers; Invites, Flags and notification settings never contact another person. The roster import uses a supplied sample, not an uploaded file. Exports contain sample data. Authentication, recurrence scheduling, delivery, AI inference and full administrative validation stay in the production application.

## Assets

The photographs are illustrative stock images from Unsplash. Each WebP has a provenance sidecar with its original URL. Manrope is self-hosted from the Google Fonts repository, with its OFL licence in `public/prototype-ui/OFL.txt`.

## Validation

Chrome DevTools checked discovery, details and administration at 1440px and 390px, plus navigation through the other screens. Browser interactions covered joining, leaving, waitlists, style changes, creation, Interests, Availability errors, Scout, roster preview, Event decisions and Interest merge/split.

`pnpm check` passed with 502 tests and 6 optional AI contract tests skipped. `pnpm build` and all 13 tests in `pnpm test:browser` passed. A direct request to the production preview route returned 404 without rendering the prototype.

Independent Standards and Spec reviews have no open findings. The visual reviewer scored both requested fixes resolved, covering the collapsible comparison toolbar and Fieldwork date heading. All 22 refreshed desktop and mobile captures were valid. This review does not select a production direction.

# Full-app UI mockups

Compare three structurally different styles for Organisation Meetups in an interactive, development-only prototype. One direction closely follows the supplied Habitect references. Alternatives change layout and hierarchy as well as palette.

## Acceptance criteria

- Switch styles through a persistent prototype toolbar and a shareable variant URL.
- Cover Member discovery, Meetups and Events, details, creation, Members, profiles, Interests, Availability, Connections, inbox, notification settings and Scout.
- Cover Organisation Admin population, lists, Interests, Event approvals, moderation, reporting and audit screens, plus Platform Admin Organisations and settings.
- Use labelled fictional data and browser-only mutations. Preserve the production app's behaviour and Organisation boundaries.
- Work at desktop and mobile widths with keyboard navigation, visible focus and usable forms.
- Verify in Chrome DevTools, run pnpm check and build, simplify the changes, and obtain independent review.
- Keep the prototype on a feature branch with a draft PR. Select a direction before a production redesign.

## Scope

The prototype compares visual systems across representative screens and states. Authentication, notification delivery, AI responses, exports and administrative actions are demonstrations. Existing application routes remain the source of production behaviour.

Three variants share synthetic content and local state. A separate /prototype/ui route lets the entire application shell change without introducing demo records or changing authenticated production routes.

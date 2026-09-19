# Urgent notice kinds email immediately

The urgent notice kinds are meetup-joined, meetup-promoted, meetup-cancelled and meetup-edited. An enabled email notice of an urgent kind sends immediately; every other kind, meetup-left and meetup-handed-over, batches into the daily digest. Telegram sends every enabled kind immediately regardless ([ADR 0004](0004-telegram-primary-notification-channel.md)), so this decision governs email timing only.

A change or cancellation must reach a Member before the Meetup so an email-only Member is never surprised by a time or Place change or a called-off Meetup ([issue #1](https://github.com/devdev999/org-meetup-app/issues/1), story 60). meetup-edited fires on a start-time, duration or Place change, and meetup-cancelled ends the Meetup, so both are time-critical. meetup-joined tells a Host their Meetup is filling and meetup-promoted tells a waitlisted Member they now have a place, both worth an immediate email while the Meetup is still ahead. A Member leaving or a Host handing over changes neither whether nor when to attend, so those wait for the digest.

This fixes the set that issue #1 and ADR 0004 left as an open list, and resolves the conflict between story 60 (never surprised by changes) and the narrower enumeration in issue #1 that omitted edits and promotions, in favour of story 60.

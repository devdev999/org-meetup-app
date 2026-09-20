# Urgent notice kinds email immediately

The urgent notice kinds are meetup-joined, meetup-promoted, meetup-cancelled, meetup-edited, invite-received, invite-accepted, availability-overlap, rsvp-prompt and attendance-prompt. Enabled email for these kinds sends immediately. Email for meetup-left, meetup-handed-over, invite-declined and attendance-confirmed batches into the daily digest. Telegram sends every enabled kind immediately under [ADR 0004](0004-telegram-primary-notification-channel.md), so this decision governs email timing only.

A change or cancellation must reach a Member before the Meetup so an email-only Member is never surprised by a time or Place change or a called-off Meetup ([issue #1](https://github.com/devdev999/org-meetup-app/issues/1), story 60). meetup-edited fires on a start-time, duration or Place change, and meetup-cancelled ends the Meetup, so both are time-critical. meetup-joined tells a Host their Meetup is filling and meetup-promoted tells a waitlisted Member they now have a place, both worth an immediate email while the Meetup is still ahead. A Member leaving or a Host handing over changes neither whether nor when to attend, so those wait for the digest.

This fixes the set that issue #1 and ADR 0004 left as an open list, and resolves the conflict between story 60 (never surprised by changes) and the narrower enumeration in issue #1 that omitted edits and promotions, in favour of story 60.

Issue #7 adds Invites. A new Invite needs an answer before the Meetup starts, so it emails immediately as required by issue #1. An acceptance joins the Meetup or its waitlist and tells the Host immediately, consistent with meetup-joined. A decline changes no place allocation, so its email waits for the digest.

Issue #9 adds Availability overlaps. The other Member is free during a same-day window, so a daily digest would usually arrive too late. Enabled email sends immediately, as required by issue #1.

Issue #10 adds RSVP prompts forty-eight hours before each occurrence. Enabled email sends immediately so email-only Members have the same time to answer, as required by issue #1.

Issue #12 adds Attendance prompts after an occurrence ends. Enabled email sends immediately because the Host has seven days to confirm or amend Attendance. A confirmation or amendment tells Participants that their own result is available in the app, without exposing anyone's outcome. That notice requires no immediate action, so its enabled email waits for the digest.

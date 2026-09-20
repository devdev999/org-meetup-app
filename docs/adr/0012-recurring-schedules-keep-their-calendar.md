# Recurring schedules keep their calendar

Each recurring Meetup or Event retains the deployment time zone used when it was created, with UTC for existing schedules. Occurrences keep their local weekday and time across daylight-saving changes, choosing the earlier repeated time or shifting a skipped time forward for that occurrence. Later deployment changes affect new schedules and report date boundaries without moving existing series, saved instants or queued digests, because silently moving agreed meeting times would surprise Participants.

export const NOTICE_KINDS = ["meetup-joined", "meetup-left", "meetup-promoted", "meetup-edited", "meetup-cancelled", "meetup-handed-over", "invite-received", "invite-accepted", "invite-declined", "availability-overlap", "rsvp-prompt"] as const;
export type NoticeKind = typeof NOTICE_KINDS[number];

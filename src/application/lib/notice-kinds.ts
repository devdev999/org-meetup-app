export const NOTICE_KINDS = ["meetup-joined", "meetup-left", "meetup-promoted", "meetup-edited", "meetup-cancelled", "meetup-handed-over"] as const;
export type NoticeKind = typeof NOTICE_KINDS[number];

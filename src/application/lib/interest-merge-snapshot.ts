export interface InterestMergeSnapshot {
  aliases: Array<{ phraseKey: string; interestId: string }>;
  declarations: Array<{ memberId: string; interestId: string; stance: "shares" | "seeks"; revision: number }>;
  gatherings: Array<{ gatheringId: string; interestId: string; revision: number }>;
  recurrences: Array<{ recurrenceId: string; interestId: string; revision: number }>;
}

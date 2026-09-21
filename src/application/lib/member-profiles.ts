import type { MemberInterest, Stance } from "./interests";

export interface MemberSummary {
  memberId: string;
  name: string;
  department: string | null;
  site: string | null;
}

export interface MemberProfile extends MemberSummary {
  interests: MemberInterest[];
}

export interface MemberSearch {
  interest?: string;
  stance?: Stance;
  department?: string;
  site?: string;
}

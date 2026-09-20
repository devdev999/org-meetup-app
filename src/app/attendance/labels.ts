import type { Attendance } from "../../application";

export const attendanceLabels: Record<Attendance["outcome"], string> = {
  unknown: "Unknown", attended: "Came", "no-show": "No-show", "not-recorded": "Not marked",
};

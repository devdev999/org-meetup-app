"use client";

import { formatTime } from "../../calendar";
import { useTimeZone } from "../_components/calendar";

export function MeetupTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatTime(value, useTimeZone())}</time>;
}

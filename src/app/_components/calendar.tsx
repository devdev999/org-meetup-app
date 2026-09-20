"use client";

import { createContext, useContext, type ReactNode } from "react";

const TimeZone = createContext("UTC");

export function Calendar({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  return <TimeZone value={timeZone}>{children}</TimeZone>;
}

export function useTimeZone(): string { return useContext(TimeZone); }

"use client";

import { useEffect, useState } from "react";

export function LocalTime({ value }: { value: string }) {
  const [local, setLocal] = useState<string>();
  useEffect(() => {
    setLocal(new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  }, [value]);
  return <time dateTime={value}>{local ?? `${value.slice(0, 16).replace("T", " ")} UTC`}</time>;
}

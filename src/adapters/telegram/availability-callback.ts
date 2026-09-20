import type { TelegramAvailabilityAction } from "../../application/ports";

export function availabilityCallback(action: TelegramAvailabilityAction): string {
  if (action.kind === "availability-activity") return `av-activity:${action.activityId}`;
  const issued = Math.floor(action.issuedAt.getTime() / 1000).toString(36);
  return `av-post:${action.activityId}:${issued}:${action.placeKind === "physical" ? "p" : "v"}:${action.minutes}`;
}

export function parseAvailabilityCallback(data: string): TelegramAvailabilityAction | undefined {
  if (data.startsWith("av-activity:")) return { kind: "availability-activity", activityId: data.slice(12) };
  const selected = data.match(/^av-post:([^:]+):([a-z0-9]{1,10}):(p|v):([^:]+)$/);
  if (!selected) return;
  return {
    kind: "availability-post", activityId: selected[1]!, issuedAt: new Date(Number.parseInt(selected[2]!, 36) * 1000),
    minutes: Number(selected[4]), placeKind: selected[3] === "p" ? "physical" : "virtual",
  };
}

import { monthToDate } from "../calendar";
import { application } from "./application";
import { InvalidInputError, isAccessDeniedError, isInvalidInputError, type PlatformReportScope, type ReportCsv, type ReportPeriod } from "../application";

export async function selectedReportPeriod(input: { from?: string; to?: string }): Promise<ReportPeriod> {
  const defaults = monthToDate(new Date(), await application().timeZone());
  return { from: input.from ?? defaults.from, to: input.to ?? defaults.to };
}

export function selectedPlatformScope(input: { scope?: string; kind?: string; id?: string }, defaultId = ""): PlatformReportScope {
  const [kind, id] = input.scope ? input.scope.split(":") : [input.kind ?? "organisation", input.id ?? defaultId];
  if ((kind !== "organisation" && kind !== "ministry") || !id) throw new InvalidInputError("invalid-report", "Choose an Organisation or Ministry.");
  return { kind, id };
}

export async function csvDownload(operation: () => Promise<ReportCsv>): Promise<Response> {
  try {
    const csv = await operation();
    return new Response(csv.content, { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (isAccessDeniedError(error)) return new Response("Report unavailable.", { status: 404 });
    if (isInvalidInputError(error)) return new Response(error.message, { status: 400 });
    throw error;
  }
}

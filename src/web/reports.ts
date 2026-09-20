import { isAccessDeniedError, isInvalidInputError, type ReportCsv, type ReportPeriod } from "../application";

export function selectedReportPeriod(input: { from?: string; to?: string }): ReportPeriod {
  const today = new Date().toISOString().slice(0, 10);
  return { from: input.from ?? `${today.slice(0, 7)}-01`, to: input.to ?? today };
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

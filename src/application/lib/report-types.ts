export interface ReportPeriod { from: string; to: string }
export interface ReportTable {
  id: string;
  title: string;
  basis: string;
  columns: string[];
  rows: (string | number | null)[][];
}
export interface Report { period: ReportPeriod; tables: ReportTable[] }

import type { ReactNode } from "react";

const icons = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "M19 12H5m6-6-6 6 6 6",
  down: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  home: "m3 10 9-7 9 7v10H3Z M9 20v-7h6v7",
  calendar:
    "M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 13h3m4 0h3m-10 4h3",
  people:
    "M16 21v-2a5 5 0 0 0-5-5H7a5 5 0 0 0-5 5v2m20 0v-2a5 5 0 0 0-4-4.8M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3a4 4 0 0 1 0 8",
  clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8m-11 12a2 2 0 0 0 4 0",
  settings: "M4 6h16M4 12h16M4 18h16M9 3v6m7 0v6m-8 0v6",
  leaf: "M20 3C9 2 3 6 4 13c1 7 10 9 14 2 2-3 2-7 2-12ZM4 21l11-12",
  coffee:
    "M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 8h2a3 3 0 0 1 0 6h-2M6 2v2m4-2v2m4-2v2",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  grid: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
  shield: "m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6ZM8 12l3 3 5-6",
  chat: "M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4ZM8 10h8m-8 4h5",
  link: "m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  logout: "M10 3H3v18h7m-2-9h14m-5-5 5 5-5 5",
} satisfies Record<string, string>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name]} />
    </svg>
  );
}

export function Avatar({
  name,
  color = "sand",
  large = false,
}: {
  name: string;
  color?: string;
  large?: boolean;
}) {
  return (
    <span
      className={`mock-avatar ${color} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      {name
        .split(" ")
        .map((word) => word[0])
        .join("")}
    </span>
  );
}

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mock-page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Status({
  children,
  tone = "good",
}: {
  children: ReactNode;
  tone?: "good" | "neutral" | "pending";
}) {
  return <span className={`mock-status ${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mock-empty">
      <Icon name="search" size={28} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: ReactNode[][];
  caption: string;
}) {
  return (
    <div
      className="mock-table-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table>
        <caption className="mock-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SectionHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mock-section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

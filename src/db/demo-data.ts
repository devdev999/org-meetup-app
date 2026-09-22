import type { InterestKind, RosterRow } from "../application";

export const DEMO_SLUG = "dsta-demo";
export const DEMO_SITE = "DSTA demo campus";

export const programmeCentres = [
  "Air Systems", "Land Systems", "Naval Systems", "Building and Infrastructure",
  "Systems Engineering and C3 Centre", "C3 Development", "Digital Hub", "Enterprise Digital Services",
];

const people = [
  ["Maya Tan", 7, "Public speaking", "Board games", "Running"],
  ["Aisha Rahman", 6, "Photography", "K-dramas", "Python"],
  ["Darren Koh", 0, "Severance", "Board games", "Photography"],
  ["Wei Ming Lim", 1, "Running", "Spreadsheets", "Public speaking"],
  ["Priya Nair", 4, "Board games", "Python", "Running"],
  ["Mei Lin Goh", 2, "Photography", "Running", "Sketching"],
  ["Harish Menon", 5, "Python", "Badminton", "Photography"],
  ["Nurul Azmi", 3, "Sketching", "K-dramas", "Spreadsheets"],
  ["Jun Jie Teo", 6, "Badminton", "Severance", "Public speaking"],
  ["Sofia Ahmad", 7, "Public speaking", "Photography", "Python"],
  ["Ravi Kumar", 0, "Running", "Repair and reuse", "Board games"],
  ["Chloe Ng", 1, "K-dramas", "Badminton", "Spreadsheets"],
  ["Ben Wong", 2, "Board games", "Severance", "Python"],
  ["Farah Ismail", 3, "Photography", "Sketching", "Running"],
  ["Daniel Yeo", 4, "Spreadsheets", "Running", "Photography"],
  ["Ananya Rao", 5, "Python", "Public speaking", "Board games"],
  ["Marcus Lee", 6, "Severance", "Badminton", "Sketching"],
  ["Hui Min Chua", 7, "K-dramas", "Photography", "Public speaking"],
  ["Amir Hassan", 0, "Repair and reuse", "Running", "Python"],
  ["Natalie Tan", 1, "Board games", "Sketching", "Badminton"],
  ["Kelvin Ong", 2, "Photography", "Spreadsheets", "Running"],
  ["Deepa Iyer", 3, "Public speaking", "K-dramas", "Photography"],
  ["Eugene Low", 4, "Badminton", "Severance", "Python"],
  ["Siti Hajar", 5, "Sketching", "Board games", "Spreadsheets"],
  ["Jia En Soh", 6, "K-dramas", "Running", "Repair and reuse"],
  ["Vikram Das", 7, "Python", "Repair and reuse", "Public speaking"],
  ["Rachel Foo", 0, "Photography", "Severance", "Badminton"],
  ["Hakim Zain", 1, "Running", "Badminton", "Sketching"],
  ["Serene Ho", 2, "Spreadsheets", "Board games", "Python"],
  ["Arun Pillai", 3, "Repair and reuse", "Public speaking", "Photography"],
] satisfies Array<[string, number, string, string, string]>;

export const demoMembers = people.map(([name, centre, first, second, seeks]) => ({
  name,
  email: `${name.toLowerCase().replaceAll(" ", ".")}@dsta.example.test`,
  department: programmeCentres[centre]!,
  site: DEMO_SITE,
  shares: [first, second],
  seeks,
}));

export const demoRoster: RosterRow[] = demoMembers.map(({ shares: _shares, seeks: _seeks, ...row }) => row);

export function interestKind(name: string): InterestKind {
  return ["Python", "Spreadsheets", "Public speaking"].includes(name) ? "skill" : "hobby";
}

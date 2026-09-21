import { useState } from "react";
import {
  Avatar,
  DataTable,
  EmptyState,
  Icon,
  PageHeading,
  SectionHeading,
  Status,
} from "./components";
import { members, type Navigate, type Notify } from "./data";

type Proposal = {
  id: string;
  title: string;
  host: string;
  status: "Pending" | "Approved" | "Rejected";
};

export function useAdminDemo() {
  const [roster, setRoster] = useState(
    members.map((member) => ({ ...member, status: "Active" })),
  );
  const [proposals, setProposals] = useState<Proposal[]>([
    {
      id: "lunch",
      title: "Lunch across Departments",
      host: "Mei Chen",
      status: "Pending",
    },
    {
      id: "photo",
      title: "Photography, one step at a time",
      host: "Daniel Tan",
      status: "Pending",
    },
  ]);
  const [merged, setMerged] = useState(false);
  const [flagOpen, setFlagOpen] = useState(true);
  const [sites, setSites] = useState(["Central Site", "North Site"]);
  const [organisations, setOrganisations] = useState([
    "Ministry A",
    "Agency B",
  ]);
  const [audit, setAudit] = useState([
    "Alex Morgan viewed the participation report",
    "Alex Morgan opened the Member roster",
  ]);
  return {
    roster,
    setRoster,
    proposals,
    setProposals,
    merged,
    setMerged,
    flagOpen,
    setFlagOpen,
    sites,
    setSites,
    organisations,
    setOrganisations,
    audit,
    setAudit,
  };
}

type AdminDemo = ReturnType<typeof useAdminDemo>;
const organisationTabs = [
  "Overview",
  "Roster",
  "Events",
  "Interests",
  "Lists",
  "Moderation",
  "Reports",
  "Audit",
];
const platformTabs = [
  "Organisations",
  "Ministries",
  "Settings",
  "Reports",
  "Audit",
];

function exportSample(rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sample-participation.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminScreens({
  platform,
  tab: requestedTab,
  navigate,
  notify,
  demo,
}: {
  platform: boolean;
  tab: string | null;
  navigate: Navigate;
  notify: Notify;
  demo: AdminDemo;
}) {
  const tabs = platform ? platformTabs : organisationTabs;
  const tab =
    tabs.find((name) => name.toLowerCase() === requestedTab) ?? tabs[0];
  const [query, setQuery] = useState("");
  const [rosterPreview, setRosterPreview] = useState(false);
  const [addingOrganisation, setAddingOrganisation] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [ministry, setMinistry] = useState("Public services");
  const go = (name: string) =>
    navigate(platform ? "platform" : "admin", name.toLowerCase());
  const record = (message: string) => {
    demo.setAudit([message, ...demo.audit]);
    notify(`${message}. Sample data only.`);
  };
  const pending = demo.proposals.filter(
    (proposal) => proposal.status === "Pending",
  );
  const activeRoster = demo.roster.filter(
    (member) => member.status === "Active",
  );
  const departmentCounts = [
    ...new Set(demo.roster.map((member) => member.department)),
  ].map((department) => ({
    department,
    count: demo.roster.filter((member) => member.department === department)
      .length,
  }));

  const reportCounts = departmentCounts.map(({ department }) => ({
    department,
    count: activeRoster.filter((member) => member.department === department)
      .length,
  }));

  return (
    <>
      <PageHeading
        title={
          platform ? "Platform administration" : "Organisation administration"
        }
        description={
          platform
            ? "Organisations, deployment settings and aggregate reporting."
            : "Ministry A · People, participation and the details that keep it running."
        }
      >
        <button
          className="mock-button secondary"
          onClick={() => navigate(platform ? "admin" : "platform")}
        >
          <Icon name="shield" size={17} />
          {platform ? "Organisation Admin" : "Platform Admin"}
        </button>
      </PageHeading>
      <nav
        className="mock-admin-tabs"
        aria-label={
          platform ? "Platform administration" : "Organisation administration"
        }
      >
        {tabs.map((name) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => go(name)}
          >
            {name}
            {name === "Events" && pending.length > 0 && (
              <span>{pending.length}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === "Overview" && (
        <>
          <div className="mock-admin-overview">
            <section>
              <h2>A few things need your attention.</h2>
              <p>Keep the small details moving, so Members can get together.</p>
              <button onClick={() => go("Events")}>
                <span>
                  <strong>{pending.length} Event proposals</strong>
                  <small>Review before they appear in discovery</small>
                </span>
                <Icon name="arrow" />
              </button>
              <button onClick={() => go("Interests")}>
                <span>
                  <strong>
                    {demo.merged
                      ? "No duplicate Interests"
                      : "1 possible duplicate Interest"}
                  </strong>
                  <small>Keep Shares and Seeks connected</small>
                </span>
                <Icon name="arrow" />
              </button>
              <button onClick={() => go("Moderation")}>
                <span>
                  <strong>
                    {demo.flagOpen ? "1 Flag to review" : "No open Flags"}
                  </strong>
                  <small>Help Members feel welcome</small>
                </span>
                <Icon name="arrow" />
              </button>
            </section>
            <aside>
              <h2>Your Organisation</h2>
              <dl>
                <dt>Members in this sample</dt>
                <dd>{demo.roster.length}</dd>
                <dt>Active Members</dt>
                <dd>
                  {
                    demo.roster.filter((member) => member.status === "Active")
                      .length
                  }
                </dd>
                <dt>Departments</dt>
                <dd>{departmentCounts.length}</dd>
                <dt>Sites</dt>
                <dd>{demo.sites.length}</dd>
              </dl>
              <button className="mock-link-button" onClick={() => go("Roster")}>
                Manage the roster <Icon name="arrow" size={17} />
              </button>
              <p className="mock-muted">
                Illustrative figures for this design preview.
              </p>
            </aside>
          </div>
          <SectionHeading title="Recent activity">
            <button className="mock-link-button" onClick={() => go("Audit")}>
              View audit log <Icon name="arrow" size={17} />
            </button>
          </SectionHeading>
          <DataTable
            caption="Recent administration activity"
            columns={["Action", "Actor", "Time"]}
            rows={demo.audit
              .slice(0, 4)
              .map((action, index) => [
                action,
                "Alex Morgan",
                `${index + 1} minutes ago`,
              ])}
          />
        </>
      )}

      {tab === "Roster" && (
        <>
          <SectionHeading title="Member roster">
            <button
              className="mock-button"
              onClick={() => setRosterPreview(!rosterPreview)}
            >
              <Icon name="plus" size={17} />
              Preview sample import
            </button>
          </SectionHeading>
          <div className="mock-filters">
            <label className="mock-search">
              <Icon name="search" />
              <input
                aria-label="Search roster"
                placeholder="Find a Member or Department"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span>{demo.roster.length} Members</span>
          </div>
          {rosterPreview && (
            <div className="mock-import-preview">
              <h3>Import preview</h3>
              <p>
                This sample adds Jordan Lee to Policy at Central Site. Existing
                Members stay on the roster.
              </p>
              <button
                className="mock-button"
                onClick={() => {
                  if (!demo.roster.some((member) => member.id === "jordan"))
                    demo.setRoster([
                      ...demo.roster,
                      {
                        id: "jordan",
                        name: "Jordan Lee",
                        department: "Policy",
                        site: "Central Site",
                        shares: "",
                        seeks: "",
                        bio: "",
                        color: "lilac",
                        status: "Provisioned",
                      },
                    ]);
                  setRosterPreview(false);
                  record("Alex Morgan applied a sample roster import");
                }}
              >
                Apply sample import
              </button>
            </div>
          )}
          <DataTable
            caption="Organisation Member roster"
            columns={["Member", "Department", "Site", "Status", "Action"]}
            rows={demo.roster
              .filter((member) =>
                `${member.name} ${member.department}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((member) => [
                <div key="member" className="mock-table-person">
                  <Avatar name={member.name} color={member.color} />
                  <span>
                    {member.name}
                    <small>
                      {member.name.toLowerCase().replaceAll(" ", ".")}
                      @ministry-a.example
                    </small>
                  </span>
                </div>,
                member.department,
                member.site,
                <Status
                  key="status"
                  tone={member.status === "Active" ? "good" : "neutral"}
                >
                  {member.status}
                </Status>,
                <button
                  key="action"
                  className="mock-link-button"
                  onClick={() => {
                    demo.setRoster(
                      demo.roster.map((entry) =>
                        entry.id === member.id
                          ? {
                              ...entry,
                              status:
                                entry.status === "Suspended"
                                  ? "Active"
                                  : "Suspended",
                            }
                          : entry,
                      ),
                    );
                    record(
                      `Alex Morgan changed ${member.name}'s sample status`,
                    );
                  }}
                >
                  {member.status === "Suspended" ? "Reinstate" : "Suspend"}
                </button>,
              ])}
          />
        </>
      )}

      {tab === "Events" && (
        <>
          <SectionHeading title="Event proposals">
            <span className="mock-muted">
              {pending.length} awaiting a decision
            </span>
          </SectionHeading>
          <div className="mock-proposal-list">
            {demo.proposals.map((proposal) => (
              <article key={proposal.id}>
                <div>
                  <Status
                    tone={
                      proposal.status === "Pending"
                        ? "pending"
                        : proposal.status === "Rejected"
                          ? "neutral"
                          : "good"
                    }
                  >
                    {proposal.status}
                  </Status>
                  <h2>{proposal.title}</h2>
                  <p>Proposed by {proposal.host} · Open to the Organisation</p>
                </div>
                {proposal.status === "Pending" && (
                  <div className="mock-form-actions">
                    <button
                      className="mock-button"
                      onClick={() => {
                        demo.setProposals(
                          demo.proposals.map((entry) =>
                            entry.id === proposal.id
                              ? { ...entry, status: "Approved" }
                              : entry,
                          ),
                        );
                        record(`Alex Morgan approved ${proposal.title}`);
                      }}
                    >
                      <Icon name="check" size={17} />
                      Approve
                    </button>
                    <button
                      className="mock-button secondary"
                      onClick={() => setRejection(proposal.id)}
                    >
                      Reject
                    </button>
                  </div>
                )}
                {rejection === proposal.id && proposal.status === "Pending" && (
                  <form
                    className="mock-rejection"
                    onSubmit={(event) => {
                      event.preventDefault();
                      demo.setProposals(
                        demo.proposals.map((entry) =>
                          entry.id === proposal.id
                            ? { ...entry, status: "Rejected" }
                            : entry,
                        ),
                      );
                      setRejection(null);
                      record(`Alex Morgan rejected ${proposal.title}`);
                    }}
                  >
                    <label>
                      Reason for rejection
                      <textarea
                        required
                        placeholder="Explain what needs to change."
                      />
                    </label>
                    <button className="mock-button">Confirm rejection</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "Interests" && (
        <>
          <SectionHeading title="Keep Interests connected" />
          <div className="mock-merge-panel">
            <div>
              <Status tone={demo.merged ? "good" : "pending"}>
                {demo.merged ? "Merged" : "Possible duplicate"}
              </Status>
              <h2>
                Coffee <span className="mock-muted">and</span> Coffee
                appreciation
              </h2>
              <p>
                {demo.merged
                  ? "Declarations now use Coffee. You can split this sample merge."
                  : "These names may describe the same Interest. Review them before merging."}
              </p>
            </div>
            <button
              className="mock-button"
              onClick={() => {
                demo.setMerged(!demo.merged);
                record(
                  demo.merged
                    ? "Alex Morgan split the Coffee merge"
                    : "Alex Morgan merged Coffee Interests",
                );
              }}
            >
              {demo.merged ? "Split merge" : "Merge into Coffee"}
              <Icon name="arrow" size={17} />
            </button>
          </div>
          <DataTable
            caption="Organisation Interests"
            columns={["Interest", "Kind", "Shares", "Seeks"]}
            rows={[
              ["Coffee", "Hobby", demo.merged ? "4" : "3", "1"],
              ["Walking", "Hobby", "2", "1"],
              ["Board games", "Hobby", "1", "1"],
              ["Data visualisation", "Skill", "1", "1"],
              ...(!demo.merged
                ? [["Coffee appreciation", "Hobby", "1", "0"]]
                : []),
            ]}
          />
        </>
      )}

      {tab === "Lists" && (
        <>
          <PageHeading
            title="Departments and Sites"
            description="Names Members use in their profiles and Meetups."
          />
          <div className="mock-two-column">
            <section>
              <h2>Sites</h2>
              {demo.sites.map((site) => (
                <div className="mock-list-row" key={site}>
                  <Icon name="pin" size={18} />
                  <strong>{site}</strong>
                  <Status>Available</Status>
                </div>
              ))}
              <form
                className="mock-inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(
                    new FormData(event.currentTarget).get("site"),
                  ).trim();
                  if (name && !demo.sites.includes(name)) {
                    demo.setSites([...demo.sites, name]);
                    record(`Alex Morgan added ${name}`);
                    event.currentTarget.reset();
                  }
                }}
              >
                <input
                  name="site"
                  aria-label="New Site name"
                  placeholder="New Site name"
                  required
                />
                <button className="mock-button">Add Site</button>
              </form>
            </section>
            <section>
              <h2>Departments</h2>
              {departmentCounts.map(({ department, count }) => (
                <div className="mock-list-row" key={department}>
                  <strong>{department}</strong>
                  <span>{count} Members</span>
                </div>
              ))}
              <h2>Activities</h2>
              <p className="mock-prose">
                Coffee, lunch, walk, game, sport, learning session and other.
              </p>
            </section>
          </div>
        </>
      )}

      {tab === "Moderation" && (
        <>
          <SectionHeading title="Flags" />
          {demo.flagOpen ? (
            <div className="mock-merge-panel">
              <div>
                <Status tone="pending">Needs review</Status>
                <h2>A Meetup description needs attention</h2>
                <p>A Member flagged an unclear Place in a sample Meetup.</p>
                <p className="mock-muted">
                  Submitted today · Visible to Organisation Admins
                </p>
              </div>
              <button
                className="mock-button"
                onClick={() => {
                  demo.setFlagOpen(false);
                  record("Alex Morgan resolved the sample Flag");
                }}
              >
                Resolve Flag <Icon name="check" size={17} />
              </button>
            </div>
          ) : (
            <EmptyState title="All Flags reviewed">
              <p>No open Flags in this sample Organisation.</p>
            </EmptyState>
          )}
        </>
      )}

      {tab === "Reports" && (
        <>
          <SectionHeading title="Participation report">
            <button
              className="mock-button secondary"
              onClick={() => {
                exportSample([
                  ["Department", "Current Members"],
                  ...reportCounts.map(({ department, count }) => [
                    department,
                    String(count),
                  ]),
                ]);
                record("Alex Morgan exported the sample report");
              }}
            >
              <Icon name="download" size={17} />
              Export sample CSV
            </button>
          </SectionHeading>
          <p className="mock-report-note">
            Sample period: 1 to 22 September 2026. Figures use the current
            Active Member population and current Departments and Sites.
          </p>
          <div className="mock-report-layout">
            <section>
              <h2>Members by Department</h2>
              <div className="mock-bars">
                {reportCounts.map(({ department, count }) => (
                  <div key={department}>
                    <span>{department}</span>
                    <div>
                      <span
                        style={{
                          width: `${(count / (activeRoster.length || 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </section>
            <aside className="mock-side-panel">
              <h2>About these figures</h2>
              <p>
                All figures are fictional.{" "}
                {platform
                  ? "Platform Admins see aggregates across Organisations."
                  : "Organisation Admins can view Member reports. Individual report access is recorded in the audit log."}
              </p>
              <p>Past-period figures can change when Members leave or move.</p>
            </aside>
          </div>
          <DataTable
            caption="Sample participation report"
            columns={[
              "Department",
              "Members",
              "Attended a Meetup",
              "Hosted a Meetup",
            ]}
            rows={reportCounts.map(({ department, count }) => [
              department,
              count,
              Math.min(count, 1),
              department === "Policy" ? 1 : 0,
            ])}
          />
        </>
      )}

      {tab === "Audit" && (
        <>
          <SectionHeading title="Audit log" />
          <p className="mock-muted">
            Sample administration actions in this preview.
          </p>
          <DataTable
            caption="Administration audit log"
            columns={["Action", "Actor", "Scope", "Time"]}
            rows={demo.audit.map((action, index) => [
              platform ? "Organisation Admin action recorded" : action,
              "Alex Morgan",
              "Ministry A",
              `${index + 1} minutes ago`,
            ])}
          />
        </>
      )}

      {tab === "Organisations" && (
        <>
          <SectionHeading title="Organisations">
            <button
              className="mock-button"
              onClick={() => setAddingOrganisation(!addingOrganisation)}
            >
              <Icon name="plus" size={17} />
              Add Organisation
            </button>
          </SectionHeading>
          <DataTable
            caption="Platform Organisations"
            columns={["Organisation", "Identity provider", "Status", "Access"]}
            rows={demo.organisations.map((name) => [
              name,
              "Configured sample issuer",
              <Status key="status">Ready</Status>,
              "Sealed by default",
            ])}
          />
          {addingOrganisation && (
            <form
              className="mock-form mock-settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = String(
                  new FormData(event.currentTarget).get("name"),
                ).trim();
                if (demo.organisations.includes(name)) {
                  notify("This sample Organisation already exists.");
                  return;
                }
                demo.setOrganisations([...demo.organisations, name]);
                setAddingOrganisation(false);
                record(`Alex Morgan created ${name}`);
              }}
            >
              <h2>New Organisation</h2>
              <label>
                Organisation name
                <input name="name" required />
              </label>
              <label>
                Issuer URL
                <input
                  type="url"
                  defaultValue="https://identity.example"
                  required
                />
              </label>
              <label>
                First Organisation Admin email
                <input type="email" placeholder="admin@example.org" required />
              </label>
              <button className="mock-button">
                Create sample Organisation
              </button>
            </form>
          )}
        </>
      )}

      {tab === "Ministries" && (
        <>
          <SectionHeading title="Ministries" />
          <p className="mock-muted">
            Group Organisations for aggregate reporting. Membership stays within
            each Organisation.
          </p>
          <form
            className="mock-form mock-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(
                new FormData(event.currentTarget).get("name"),
              );
              setMinistry(name);
              record("Alex Morgan updated the sample Ministry");
            }}
          >
            <label>
              Ministry name
              <input name="name" defaultValue={ministry} required />
            </label>
            <fieldset>
              <legend>Organisations</legend>
              {demo.organisations.map((name) => (
                <label className="mock-checkbox" key={name}>
                  <input type="checkbox" defaultChecked />
                  {name}
                </label>
              ))}
            </fieldset>
            <button className="mock-button">
              Save Ministry <Icon name="check" size={17} />
            </button>
          </form>
        </>
      )}

      {tab === "Settings" && (
        <>
          <SectionHeading title="Deployment settings" />
          <form
            className="mock-form mock-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              record("Alex Morgan saved sample deployment settings");
            }}
          >
            <label>
              Time zone
              <select defaultValue="Asia/Singapore">
                <option>Asia/Singapore</option>
                <option>UTC</option>
                <option>Europe/London</option>
              </select>
            </label>
            <label>
              Scout endpoint
              <input type="url" placeholder="https://provider.example/v1" />
            </label>
            <label>
              Scout model
              <input placeholder="Configured model name" />
            </label>
            <label>
              Interest extraction model
              <input placeholder="Configured extraction model name" />
            </label>
            <label>
              Telegram username
              <input placeholder="Organisation notification account" />
            </label>
            <label>
              Email sender
              <input type="email" defaultValue="meetups@ministry-a.example" />
            </label>
            <p className="mock-muted">
              This form changes only the preview. Deployment credentials belong
              in the configured secret store.
            </p>
            <button className="mock-button">
              Save settings <Icon name="check" size={17} />
            </button>
          </form>
        </>
      )}
    </>
  );
}

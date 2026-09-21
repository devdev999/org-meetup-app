import { describe, expect, test } from "vitest";
import { ministryA, ministryB, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";
import { AccessDeniedError } from "../index";
import type { AiCompletion } from "../ports";

const adminPerson = { sub: "olivia", name: "Olivia Admin", email: "olivia@example.test" };
const period = { from: "2026-09-01", to: "2026-09-30" };

describe.each(["native", "structured"] as const)("Organisation Admin Scout with %s tools", (aiToolProtocol) => {
  const h = harness({ aiToolProtocol });

  async function setup() {
    await h.setupOrganisation({ ...ministryA, organisationAdmin: adminPerson });
    const olivia = await signInAndAcknowledgeAs(h, "ministry-a", adminPerson);
    return { olivia, admin: await olivia.organisationAdmin() };
  }

  function toolData() {
    const message = h.ai.completionRequests.at(-1)!.messages.at(-1)!;
    const content = JSON.parse(String(message.content));
    return message.role === "tool" ? content : JSON.parse(content.toolResult.content);
  }

  test("reads the existing duplicate queue in the asker's Organisation without proposing or merging", async () => {
    const { olivia, admin } = await setup();
    const names = ["Ana Silva's SQL", "Ana Silva's database class"];
    for (const name of names) await olivia.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "shares" });
    h.ai.clusteringResponses.push([names]);
    await admin.proposeInterestMerges();
    const queue = await admin.interestMergeProposals();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.interests.map(({ name, count }) => [name, count])).toEqual([
      ["Ana Silva's SQL", 1], ["Ana Silva's database class", 1],
    ]);
    await h.setupOrganisation(ministryB);
    const outside = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "other", email: "other@example.test", name: "Other Organisation Member" });
    await outside.confirmInterest({ phrase: "Other Organisation secret", selection: { name: "Other Organisation secret", kind: "skill" }, stance: "shares" });
    const clusteringCount = h.ai.clusteringRequests.length;
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "duplicates", name: "duplicate_interests", arguments: {} } },
      { kind: "answer", text: "Ana Silva's SQL and Ana Silva's database class are in the merge queue." },
    );

    const answer = await olivia.askScout({ question: "Which Interests look like duplicates for Ana Silva?" });

    expect(toolData()).toEqual({ items: queue, total: 1 });
    expect(answer.links).toContainEqual({ label: "Interest merge queue", href: "/admin/interests#interest-merge-queue" });
    expect(answer.links).toContainEqual({ label: "Interest list", href: "/admin/interests#interest-catalog" });
    const requests = JSON.stringify(h.ai.completionRequests);
    expect(requests).toContain("Ana Silva's SQL");
    expect(requests).not.toContain("Other Organisation secret");
    expect(requests).not.toContain("Other Organisation Member");
    expect(h.ai.clusteringRequests).toHaveLength(clusteringCount);
    expect(await admin.interestMergeProposals()).toEqual(queue);
    expect(await admin.interestMergeHistory()).toEqual([]);
  });

  test("returns the normal unshared Seeks report with its current-population basis and links", async () => {
    const { olivia, admin } = await setup();
    await olivia.confirmInterest({ phrase: "Ana Silva's ceramics", selection: { name: "Ana Silva's ceramics", kind: "hobby" }, stance: "seeks" });
    await olivia.confirmInterest({ phrase: "SQL", selection: { name: "SQL", kind: "skill" }, stance: "seeks" });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", name: "Maya", email: "maya@example.test" });
    const sqlInterest = (await olivia.myInterests()).find(({ name }) => name === "SQL")!;
    await maya.confirmInterest({ phrase: "SQL", selection: { interestId: sqlInterest.interestId }, stance: "shares" });
    await h.setupOrganisation(ministryB);
    const outsider = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "outside", name: "Outside", email: "outside@example.test" });
    await outsider.confirmInterest({ phrase: "Hidden Organisation skill", selection: { name: "Hidden Organisation skill", kind: "skill" }, stance: "seeks" });
    const expected = (await admin.reports(period)).tables.find(({ id }) => id === "unmet-seeks")!;
    expect(expected.rows).toEqual([["Ana Silva's ceramics", "Hobby", 1]]);
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "unshared", name: "unshared_seeks", arguments: {} } },
      { kind: "answer", text: "One Member Seeks Ana Silva's ceramics, and nobody Shares it." },
    );

    const answer = await olivia.askScout({ question: "What do people Seek that nobody Shares?" });

    expect(toolData()).toEqual({ period: { from: "2026-09-01", to: "2026-09-18" }, timeZone: "UTC", tables: [{ ...expected, totalRows: 1 }] });
    expect(JSON.stringify(h.ai.completionRequests)).not.toContain("Hidden Organisation skill");
    expect(answer.links).toContainEqual({ label: "Interest list", href: "/admin/interests#interest-catalog" });
    expect(answer.links).toContainEqual({ label: "Seeks with no Shares", href: "/admin/reports?from=2026-09-01&to=2026-09-18#unmet-seeks" });
  });

  test("returns the dashboard's exact headline figures, dates, time zone and population basis", async () => {
    const { olivia, admin } = await setup();
    await admin.createListEntry("department", "Ana Silva's unit");
    await olivia.updateProfile({ department: "Ana Silva's unit", site: null });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", name: "Maya", email: "maya@example.test" });
    const meetup = await olivia.createMeetup({ activityId: (await olivia.meetupChoices()).activities[0]!.id,
      startsAt: new Date("2026-09-18T09:10:00Z"), durationMinutes: 30, capacity: 2,
      place: { kind: "virtual", url: "https://meet.example/scout-report" } });
    await maya.joinMeetup(meetup.id);
    h.clock.set(new Date("2026-09-18T10:00:00Z"));
    await olivia.confirmAttendance(meetup.id, [(await olivia.profile()).memberId, (await maya.profile()).memberId]);
    await h.setupOrganisation(ministryB);
    const outsideAdmin = await h.organisationAdmin("ministry-b");
    const hiddenActivity = await outsideAdmin.createListEntry("activity", "Other Organisation private Activity");
    await outsideAdmin.createEvent({ activityId: hiddenActivity.id, startsAt: new Date("2026-09-18T11:00:00Z"), durationMinutes: 30,
      place: { kind: "virtual", url: "https://meet.example/other" } });
    const selected = { from: "2026-09-18", to: "2026-09-18" };
    const expected = await admin.reports(selected);
    expect(expected.tables.find(({ id }) => id === "rsvp-attendance")!.rows).toContainEqual(["Meetup", 2, 0, 0, 2, 2, 0, 0]);
    expect(expected.tables.find(({ id }) => id === "telegram")!.rows).toEqual([[0, 3, 0]]);
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "headlines", name: "report_headlines", arguments: selected } },
      { kind: "answer", text: "Two Members attended one Meetup on 18 September. There are three Active Members." },
    );

    const answer = await olivia.askScout({ question: "Show headline figures for 2026-09-18 through 2026-09-18, including Ana Silva's unit." });

    expect(toolData()).toEqual({ ...expected, tables: expected.tables.map((table) => ({ ...table, totalRows: table.rows.length })) });
    expect(answer.links).toContainEqual({ label: "Reports", href: "/admin/reports?from=2026-09-18&to=2026-09-18" });
    const requests = JSON.stringify(h.ai.completionRequests);
    expect(requests).toContain("Ana Silva's unit");
    expect(requests).not.toContain("Other Organisation private Activity");
    expect(await admin.reports(selected)).toEqual(expected);
  });

  test("answers all three admin questions with the memory provider's normal responder", async () => {
    const { olivia, admin } = await setup();
    for (const name of ["SQL", "Structured Query Language"]) {
      await olivia.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "shares" });
    }
    await olivia.confirmInterest({ phrase: "Rust", selection: { name: "Rust", kind: "skill" }, stance: "seeks" });
    await admin.proposeInterestMerges();

    const duplicates = await olivia.askScout({ question: "Which Interests look like duplicates?" });
    const unshared = await olivia.askScout({ question: "What do people Seek that nobody Shares?" });
    const headlines = await olivia.askScout({ question: "Show headline figures from 2026-09-01 through 2026-09-18." });

    expect(duplicates.text).toContain("SQL");
    expect(duplicates.text).toContain("Structured Query Language");
    expect(unshared.text).toContain("Rust: 1 Seeks");
    expect(headlines.text).toContain("2026-09-01 through 2026-09-18");
    expect(headlines.text).toContain("Active Members: 2");
    expect(headlines.links).toContainEqual({ label: "Reports", href: "/admin/reports?from=2026-09-01&to=2026-09-18" });
  });

  test("distinguishes current population figures from the selected report period", async () => {
    const { olivia, admin } = await setup();
    const selected = { from: "2020-01-01", to: "2020-01-31" };
    const report = await admin.reports(selected);
    expect(report.tables.find(({ id }) => id === "telegram")!.rows).toEqual([[0, 2, 0]]);
    expect(report.tables.find(({ id }) => id === "activation")!.rows[0]![0]).toBe(0);

    const answer = await olivia.askScout({ question: "Show report headlines from 2020-01-01 through 2020-01-31." });

    expect(answer.text).toContain("Reports from 2020-01-01 through 2020-01-31, UTC.");
    expect(answer.text).toContain("Current Active Members, independent of the selected period.");
    expect(answer.text).toContain("Active Members: 2");
    expect(answer.text).toContain("Members initially provisioned in the selected period, including inactive Members.");
    expect(answer.text).toContain("Provisioned Members: 0");
  });

  test("reads merge queue questions while refusing merge and approval commands", async () => {
    const { olivia, admin } = await setup();
    for (const name of ["SQL", "Structured Query Language"]) {
      await olivia.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "shares" });
    }
    await admin.proposeInterestMerges();
    const queue = await admin.interestMergeProposals();

    for (const question of ["Show the Interest merge queue.", "List the Interest merge proposals."]) {
      const answer = await olivia.askScout({ question });
      expect(answer.text).toContain("Structured Query Language");
      expect(answer.links).toContainEqual({ label: "Interest merge queue", href: "/admin/interests#interest-merge-queue" });
    }
    for (const question of ["Merge SQL and Structured Query Language.", "Approve the proposals in the Interest merge queue."]) {
      const answer = await olivia.askScout({ question });
      expect(answer.text).toBe("Open the relevant screen to take that action yourself.");
    }
    expect(await admin.interestMergeProposals()).toEqual(queue);
    expect(await admin.interestMergeHistory()).toEqual([]);
  });

  test.each(["Member", "Organisation Admin"])("keeps Member Interest searches ahead of administrative keywords for the %s", async (role) => {
    const { olivia } = await setup();
    const member = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", name: "Maya Reporter", email: "maya@example.test" });
    const asker = role === "Member" ? member : olivia;
    for (const name of ["report writing", "duplicate detection", "unmet needs research"]) {
      await maya.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "shares" });
      const answer = await asker.askScout({ question: `Who Shares ${name}?` });
      expect(answer.text).toContain("Maya Reporter matches your Interest search.");
      expect(answer.links).toContainEqual({ label: "Maya Reporter", href: `/members/${(await maya.profile()).memberId}` });
      expect(toolData()).toMatchObject({ total: 1, items: [expect.objectContaining({ name: "Maya Reporter" })] });
    }
  });

  test("does not advertise or dispatch admin tools for ordinary Members or Platform Admins", async () => {
    const { olivia } = await setup();
    const ordinary = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
    const platform = await signInAndAcknowledgeAs(h, "ministry-a", { sub: ministryA.platformAdmin.email, ...ministryA.platformAdmin });
    expect((await platform.profile()).isPlatformAdmin).toBe(true);
    expect((await platform.profile()).isOrganisationAdmin).toBe(false);
    const names = ["duplicate_interests", "unshared_seeks", "report_headlines"];
    for (const asker of [ordinary, platform]) {
      h.ai.reset();
      for (const name of names) {
        h.ai.completionResponses.push({ kind: "tool", call: { id: "forbidden", name, arguments: {} } });
        await expect(asker.askScout({ question: "Show administrative information." })).rejects.toMatchObject({ code: "invalid-scout" });
      }
      const requests = JSON.stringify(h.ai.completionRequests);
      for (const name of names) expect(requests).not.toContain(name);
    }
    h.ai.reset();
    h.ai.completionResponses.push({ kind: "answer", text: "Ask a question about your Organisation." });
    await olivia.askScout({ question: "What can I ask?" });
    const request = JSON.stringify(h.ai.completionRequests[0]);
    for (const name of [...names, "available_now", "members_by_interest", "upcoming_meetups_and_events", "my_connections"]) expect(request).toContain(name);
    expect(request).not.toContain("member_report");
    expect(request).not.toContain("approve_interest_merge");
  });

  test("uses the dashboard's month-to-date default in the deployment time zone", async () => {
    const { olivia } = await setup();
    const platform = await (await signInAndAcknowledgeAs(h, "ministry-a", { sub: ministryA.platformAdmin.email, ...ministryA.platformAdmin })).platformAdmin();
    await platform.updateSettings({ ...await platform.settings(), timeZone: "Asia/Singapore" });
    h.clock.set(new Date("2026-09-30T17:30:00Z"));
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "headlines", name: "report_headlines", arguments: { from: null, to: null } } },
      { kind: "answer", text: "These are today's report figures." },
    );

    const answer = await olivia.askScout({ question: "Show the current report headlines." });

    expect(toolData()).toMatchObject({ period: { from: "2026-10-01", to: "2026-10-01" }, timeZone: "Asia/Singapore" });
    expect(answer.links).toContainEqual({ label: "Reports", href: "/admin/reports?from=2026-10-01&to=2026-10-01" });
  });

  test("rejects invalid report dates, forged scopes, individual reports and write tools", async () => {
    const { olivia, admin } = await setup();
    const before = { interests: await admin.interests(), queue: await admin.interestMergeProposals(), report: await admin.reports(period) };
    for (const args of [
      { from: "2026-09-31", to: "2026-10-01" }, { from: "2026-10-01", to: "2026-09-01" },
      { from: "2026-09-01" }, { ...period, organisationId: "other" }, { ...period, memberId: "other" }, { ...period, tableId: "member-profile" },
    ]) {
      h.ai.completionResponses.push({ kind: "tool", call: { id: "invalid", name: "report_headlines", arguments: args } });
      await expect(olivia.askScout({ question: "Read a report." })).rejects.toMatchObject({ code: "invalid-scout" });
    }
    for (const name of ["duplicate_interests", "unshared_seeks"]) {
      h.ai.completionResponses.push({ kind: "tool", call: { id: "scope", name, arguments: { organisationId: "other" } } });
      await expect(olivia.askScout({ question: "Read administrative information." })).rejects.toMatchObject({ code: "invalid-scout" });
    }
    for (const name of ["approve_interest_merge", "propose_interest_merges", "split_interest_merge", "member_report", "export_report"]) {
      h.ai.completionResponses.push({ kind: "tool", call: { id: "write", name, arguments: {} } });
      await expect(olivia.askScout({ question: "Take an administrative action." })).rejects.toMatchObject({ code: "invalid-scout" });
    }
    expect({ interests: await admin.interests(), queue: await admin.interestMergeProposals(), report: await admin.reports(period) }).toEqual(before);
    expect(h.ai.clusteringRequests).toEqual([]);
    await expect(admin.reports(period, "member-profile")).rejects.toMatchObject({ code: "invalid-report" });
  });

  test("keeps identifying admin conversation only while its supporting report still matches", async () => {
    const { olivia } = await setup();
    await olivia.confirmInterest({ phrase: "Ana Silva's ceramics", selection: { name: "Ana Silva's ceramics", kind: "hobby" }, stance: "seeks" });
    const first = await olivia.askScout({ question: "What do people Seek that nobody Shares?" });
    expect(first.text).toContain("Ana Silva's ceramics");
    h.ai.completionResponses.push({ kind: "answer", text: "Ana Silva's ceramics is the only unshared Interest." });
    const second = await olivia.askScout({ question: "Is that the only gap?", conversation: first.conversation });
    expect(second.conversationReset).toBe(false);
    expect(JSON.stringify(h.ai.completionRequests.at(-1))).toContain(first.text);
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", name: "Maya", email: "maya@example.test" });
    const interest = (await olivia.myInterests())[0]!;
    await maya.confirmInterest({ phrase: interest.name, selection: { interestId: interest.interestId }, stance: "shares" });
    h.ai.completionResponses.push({ kind: "answer", text: "Ask again for the current gaps." });

    const changed = await olivia.askScout({ question: "What about now?", conversation: second.conversation });

    expect(changed.conversationReset).toBe(true);
    expect(changed.conversation.turns).toHaveLength(1);
    expect(JSON.stringify(h.ai.completionRequests.at(-1))).not.toContain("Ana Silva's ceramics");
    expect(JSON.stringify(h.ai.completionRequests.at(-1))).not.toContain("Is that the only gap?");
  });

  test("rejects an answer when an unshared Seek gains a Share while AI is answering", async () => {
    const { olivia } = await setup();
    await olivia.confirmInterest({ phrase: "Rust", selection: { name: "Rust", kind: "skill" }, stance: "seeks" });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", name: "Maya", email: "maya@example.test" });
    const interest = (await olivia.myInterests())[0]!;
    const entered = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<AiCompletion>();
    h.ai.completionResponses.push({ kind: "tool", call: { id: "gaps", name: "unshared_seeks", arguments: {} } },
      async () => { entered.resolve(); return reply.promise; });
    const answer = olivia.askScout({ question: "What do people Seek that nobody Shares?" });
    const stale = expect(answer).rejects.toMatchObject({ code: "stale-scout" });
    try {
      await entered.promise;
      await maya.confirmInterest({ phrase: "Rust", selection: { interestId: interest.interestId }, stance: "shares" });
    } finally { reply.resolve({ kind: "answer", text: "Nobody Shares Rust." }); }
    await stale;
  });

  test("rechecks admin access after an AI wait and refuses reuse after suspension", async () => {
    const { olivia, admin } = await setup();
    const memberId = (await olivia.profile()).memberId;
    const first = await olivia.askScout({ question: "Show report headlines." });
    const entered = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<AiCompletion>();
    h.ai.completionResponses.push(async () => { entered.resolve(); return reply.promise; });
    const answer = olivia.askScout({ question: "Explain those figures.", conversation: first.conversation });
    const denied = expect(answer).rejects.toBeInstanceOf(AccessDeniedError);
    try {
      await entered.promise;
      await admin.suspendMember(memberId);
    } finally { reply.resolve({ kind: "answer", text: "Here are the previous administrative figures." }); }
    await denied;
    const requests = h.ai.completionRequests.length;
    await expect(olivia.askScout({ question: "Explain them again.", conversation: first.conversation })).rejects.toBeInstanceOf(AccessDeniedError);
    expect(h.ai.completionRequests).toHaveLength(requests);
  });

  test("bounds report rows while preserving full row counts and whole-population figures", async () => {
    const { olivia, admin } = await setup();
    for (let index = 0; index < 24; index++) {
      const name = `Sought skill ${String(index).padStart(2, "0")}`;
      await olivia.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "seeks" });
    }
    const expected = (await admin.reports(period)).tables.find(({ id }) => id === "unmet-seeks")!;
    expect(expected.rows).toHaveLength(24);
    const gaps = await olivia.askScout({ question: "What do people Seek that nobody Shares?" });
    expect(toolData().tables).toEqual([{ ...expected, rows: expected.rows.slice(0, 20), totalRows: 24 }]);
    expect(gaps.text).toContain("Showing 20 of 24 Interests");
    await olivia.askScout({ question: "Show report headlines." });
    expect(toolData().tables).toContainEqual({ ...expected, rows: expected.rows.slice(0, 20), totalRows: 24 });
    expect(toolData().tables).toContainEqual(expect.objectContaining({ id: "telegram", rows: [[0, 2, 0]], totalRows: 1 }));
  });

  test("states when its duplicate answer shows fewer proposals than the queue", async () => {
    const { olivia, admin } = await setup();
    const groups = Array.from({ length: 4 }, (_, index) => [`First phrase ${index}`, `Second phrase ${index}`]);
    for (const name of groups.flat()) {
      await olivia.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "shares" });
    }
    h.ai.clusteringResponses.push(groups);
    await admin.proposeInterestMerges();

    const answer = await olivia.askScout({ question: "Which Interests look like duplicates?" });

    expect(toolData().total).toBe(4);
    expect(answer.text).toContain("Showing 3 of 4 proposals");
    expect(answer.links).toContainEqual({ label: "Interest merge queue", href: "/admin/interests#interest-merge-queue" });
  });

  test("records successful Scout usage without adding individual-view audits for aggregate reads", async () => {
    const { olivia, admin } = await setup();
    const before = await admin.auditLog();
    const memberId = (await olivia.profile()).memberId;
    h.clock.set(new Date("2026-09-18T09:05:00Z"));
    for (const question of ["Which Interests look like duplicates?", "What do people Seek that nobody Shares?", "Show report headlines."]) {
      await olivia.askScout({ question });
    }
    expect(await admin.auditLog()).toEqual(before);
    const report = await admin.memberReport(memberId, period);
    const profile = report.tables.find(({ id }) => id === "member-profile")!;
    expect(profile.rows[0]![profile.columns.indexOf("Last activity")]).toBe("2026-09-18T09:05:00.000Z");
  });
});

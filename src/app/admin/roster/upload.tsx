"use client";

import { useActionState } from "react";
import type { RosterPreview } from "../../../application/index";
import { commitRosterUpload, previewRosterUpload, type UploadState } from "./actions";
import { RosterTable } from "./roster-table";

export function RosterUpload() {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    (_previous, form) => previewRosterUpload(form),
    {},
  );
  return (
    <section>
      <h2>Upload a roster</h2>
      <p>
        Upload the full roster with email, name, Department and Site columns. Staff identifier is optional. Blank
        Department and Site cells are allowed.
      </p>
      <p>
        Members missing from this file will become Departed and lose access. Include your own row to keep your access.
      </p>
      <form action={action}>
        <label>
          Roster CSV
          <input type="file" name="roster" accept=".csv,text/csv" required />
        </label>
        <button disabled={pending}>{pending ? "Preparing preview..." : "Preview roster"}</button>
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
      </form>
      {!pending && state.preview && state.csv !== undefined && (
        <RosterCommit key={state.preview.revision} csv={state.csv} preview={state.preview} />
      )}
    </section>
  );
}

function RosterCommit({ csv, preview }: { csv: string; preview: RosterPreview }) {
  const [state, action, pending] = useActionState<Awaited<ReturnType<typeof commitRosterUpload>>, FormData>(
    (_previous, form) => commitRosterUpload(form),
    {},
  );
  if (state.saved)
    return (
      <p className="notice" role="status">
        Roster committed.
      </p>
    );
  return (
    <section className="roster-preview" aria-label="Roster preview">
      <h2>Review before committing</h2>
      <h3>Additions: {preview.additions.length}</h3>
      {preview.additions.length > 0 && <RosterTable rows={preview.additions} />}
      <h3>Changes: {preview.changes.length}</h3>
      {preview.changes.map((change) => (
        <RosterTable
          key={change.before.memberId}
          rows={[
            { ...change.before, label: "Current" },
            { ...change.after, label: "After commit" },
          ]}
        />
      ))}
      <h3>Departures: {preview.departures.length}</h3>
      {preview.departures.length > 0 && <RosterTable rows={preview.departures} />}
      <form action={action}>
        <input type="hidden" name="csv" value={csv} />
        <input type="hidden" name="revision" value={preview.revision} />
        <button disabled={pending}>{pending ? "Committing..." : "Commit roster"}</button>
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}

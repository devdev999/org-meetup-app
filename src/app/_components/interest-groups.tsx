import type { MemberInterest } from "../../application/index";
import { StanceForm } from "../interests/stance-form";

export function InterestGroups({ interests, editable = false }: { interests: MemberInterest[]; editable?: boolean }) {
  return (
    <div className="interest-groups">
      {(["skill", "hobby"] as const).map((kind) => {
        const group = interests.filter((interest) => interest.kind === kind);
        return (
          <section key={kind}>
            <h3>{kind === "skill" ? "Skills" : "Hobbies"}</h3>
            {group.length === 0 ? <p className="muted">None declared.</p> : (
              <ul className="interest-list">
                {group.map((interest) => (
                  <li key={interest.interestId}>
                    <span><strong>{interest.name}</strong> <span className="muted">{interest.stance === "shares" ? "Shares" : "Seeks"}</span></span>
                    {editable && <StanceForm key={`${interest.interestId}:${interest.stance}`} interest={interest} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

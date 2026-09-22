import { requireMemberPastWelcome } from "../../web/session";
import { AvailabilityForm } from "./availability-form";
import { LiveAvailability } from "./live-availability";

export default async function AvailabilityPage() {
  const { member } = await requireMemberPastWelcome();
  const [choices, board] = await Promise.all([
    member.meetupChoices(),
    member.availability(),
  ]);
  return (
    <main>
      <h1>Availability</h1>
      <p>
        Share what you are free for today. Physical Availability is visible at
        your Site; virtual Availability is visible across your Organisation.
      </p>
      <AvailabilityForm choices={choices} />
      <p className="muted">
        In Telegram, send /available, then choose an Activity and a window.
      </p>
      <LiveAvailability board={board} />
    </main>
  );
}

import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { NoticePreferenceForm, TelegramConnection } from "./settings";

export default async function NotificationsPage() {
  const { member } = await requireMemberPastWelcome();
  const settings = await member.notificationSettings();
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/inbox">Inbox</Link>
        <Link href="/profile">Profile</Link>
      </nav>
      <h1>Notification settings</h1>
      <p>Every notice stays in your inbox. Choose which notices you also receive through Telegram and email.</p>
      <h2>Telegram account</h2>
      <TelegramConnection available={settings.telegramAvailable} linked={settings.telegramLinked} />
      <h2>Delivery preferences</h2>
      <p className="muted">Telegram notices arrive immediately. Email for joins, waitlist promotions, cancellations and time, duration or Place changes arrives immediately. Other email notices arrive in a daily digest at 09:00 UTC.</p>
      {settings.preferences.map((preference) => <NoticePreferenceForm key={preference.kind} preference={preference} />)}
    </main>
  );
}

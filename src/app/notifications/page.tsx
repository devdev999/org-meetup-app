import { application } from "../../web/application";
import { requireMemberPastWelcome } from "../../web/session";
import { NoticePreferenceForm, TelegramConnection } from "./settings";

export default async function NotificationsPage() {
  const { member } = await requireMemberPastWelcome();
  const timeZone = await application().timeZone();
  const settings = await member.notificationSettings();
  return (
    <main>
      <h1>Notification settings</h1>
      <p>
        Every notice stays in your inbox. Choose which notices you also receive
        through Telegram and email.
      </p>
      <h2>Telegram account</h2>
      <TelegramConnection
        available={settings.telegramAvailable}
        linked={settings.telegramLinked}
      />
      <h2>Delivery preferences</h2>
      <p>These preferences apply to both Meetups and Events.</p>
      <p className="muted">
        Telegram notices arrive immediately. Email for new and accepted Invites,
        joins, waitlist promotions, cancellations and time, duration or Place
        changes arrives immediately. Other email notices, including declined
        Invites, arrive in a daily digest at 09:00 {timeZone}.
      </p>
      {settings.preferences.map((preference) => (
        <NoticePreferenceForm key={preference.kind} preference={preference} />
      ))}
    </main>
  );
}

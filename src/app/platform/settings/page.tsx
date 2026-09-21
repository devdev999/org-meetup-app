import { requirePlatformAdmin } from "../../../web/session";
import { ActionForm } from "../../_components/action-form";
import { updateSettings } from "../actions";

export default async function SettingsPage() {
  const settings = await (await requirePlatformAdmin()).settings();
  return <>
    <h2>Deployment settings</h2>
    <p>Saved settings apply to new operations in the running services. An operator installs credentials and selects integration providers through the environment.</p>
    <ActionForm action={updateSettings} label="Save settings">
      <label>AI endpoint<input name="aiBaseUrl" type="url" defaultValue={settings.aiBaseUrl ?? ""} placeholder="https://provider.example/v1" /></label>
      <label>Scout model<input name="scoutModel" required maxLength={120} defaultValue={settings.scoutModel} /></label>
      <label>Interest extraction model<input name="extractionModel" required maxLength={120} defaultValue={settings.extractionModel} /></label>
      <p>Interest extraction and canonicalisation use the small model independently of Scout. Use gpt-5.6-luna when your endpoint supports it.</p>
      <label>Telegram bot username<input name="telegramBotUsername" defaultValue={settings.telegramBotUsername ?? ""} pattern="[A-Za-z0-9_]{5,32}" /></label>
      <label>Email sender<input name="emailFrom" type="email" defaultValue={settings.emailFrom ?? ""} /></label>
      <label>Time zone<input name="timeZone" required defaultValue={settings.timeZone} list="time-zones" /></label>
      <datalist id="time-zones"><option value="UTC" /><option value="Asia/Singapore" /><option value="Europe/London" /><option value="America/New_York" /></datalist>
      <p>Use an IANA time zone. New schedules, Availability days, report dates and daily digests use this calendar. Existing recurring schedules keep their original calendar. Saved instants and pending digests keep their times.</p>
    </ActionForm>
  </>;
}

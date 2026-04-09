import SettingsClient from "./settings-client";

export default function SettingsPage() {
  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Configuration that affects scaffold behavior and automation.
      </p>

      <div className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Cron installation</h2>
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
          Recipes can declare cron jobs. This controls whether Kitchen installs/reconciles them during scaffold.
          <span className="mt-2 block text-[color:var(--ck-text-tertiary)]">
            Safety note: jobs can send messages / run automatically. Default should remain conservative.
          </span>
        </p>

        <div className="mt-4">
          <SettingsClient />
        </div>
      </div>
    </div>
  );
}

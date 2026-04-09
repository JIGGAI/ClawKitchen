"use client";

type TeamSkillsTabProps = {
  teamId: string;
  skillsList: string[];
  availableSkills: string[];
  skillsLoading: boolean;
  selectedSkill: string;
  setSelectedSkill: (v: string) => void;
  installingSkill: boolean;
  teamSkillMsg: string;
  teamSkillError: string;
  onInstallSkill: () => Promise<void>;
};

export function TeamSkillsTab(props: TeamSkillsTabProps) {
  const p = props;
  return (
    <div className="mt-6 ck-card p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Skills</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Skills installed in this team workspace. For agent-specific skills, open the agent from the Agents tab.
      </p>
      <div className="mt-4">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Installed</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
          {p.skillsList.length ? p.skillsList.map((s) => <li key={s}>{s}</li>) : <li>None installed.</li>}
        </ul>
      </div>
      <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Add a skill</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={p.selectedSkill}
            onChange={(e) => p.setSelectedSkill(e.target.value)}
            disabled={p.installingSkill || p.skillsLoading || !p.availableSkills.length}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          >
            {p.availableSkills.length
              ? p.availableSkills.map((s) => <option key={s} value={s}>{s}</option>)
              : <option value="">No skills found</option>}
          </select>
          <button
            type="button"
            disabled={p.installingSkill || p.skillsLoading || !p.selectedSkill}
            onClick={p.onInstallSkill}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
          >
            {p.installingSkill ? "Adding" : "Add"}
          </button>
        </div>
        {p.teamSkillError && (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {p.teamSkillError}
          </div>
        )}
        {p.teamSkillMsg && (
          <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {p.teamSkillMsg}
          </div>
        )}
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          Uses openclaw recipes install-skill with team-id {p.teamId}.
        </div>
      </div>
    </div>
  );
}

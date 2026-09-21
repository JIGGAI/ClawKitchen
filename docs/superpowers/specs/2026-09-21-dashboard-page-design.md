# Dashboard page — design

Date: 2026-09-21 · Status: approved in chat · Ported from JIGGA's jiggaview `/dashboard`
Builds on `feat/workflows-page` (reuses `src/lib/workflows/overview.ts`). Remove
`docs/superpowers/` before merge.

## Goal

A `/dashboard` page — first sidebar item, `/` stays Agents — that says what the install
is and what it is doing, read from files at request time (server-rendered, no cache,
no auto-refresh, no CLI calls).

## Data (verified on HMX 2026-09-21)

- Manifest `~/.openclaw/kitchen-manifest.json` via `readManifest()` (already hides
  `attestations`): 5 teams incl. `main` (the personal workspace — not shown as a team),
  34 agents (`id`, `identityName`, `workspace`), team `roles`, `ticketCounts`
  `{backlog, in-progress, testing, done, total}`. Team display name: `displayName` →
  recipe with the same id → id. Kitchen's `isManifestStale` threshold is 10 s (regenerates
  on demand), so it is useless as a health signal.
- Agent → team: agent `workspace` contains `/workspace-<teamId>/`. Lead = `<teamId>-lead`.
  A role with no agent `<teamId>-<role>` is "missing".
- Queues (`shared-context/workflow-queues/`): `<agentId>.jsonl` lines
  `{id, ts, teamId, runId, nodeId, kind}`; `<agentId>.state.json` `{offsetBytes}` — lines
  starting at/after the offset are pending (offset > size means reset to 0, as ClawRecipes
  does). `claims/<agentId>.<taskId>.json` `{taskId, agentId, workerId, claimedAt,
  leaseSeconds?}` — deleted on release. Queues are compacted (consumed prefix removed),
  so they cannot answer "what did an agent do last".
- Runs: `listRunGraphs` with no effective limit (all 258 in ~15 ms) — node `agent`,
  `status`, `ts` give per-agent history.
- Kitchen plugins: `discoverKitchenPlugins()` → `id, name, teamTypes, tabs` (no version).

## Panels

1. **Stat cards** — Teams (count; first two names; → `/`, which groups agents by team), Agents (count; "N working now"),
   Workflows (installed count; "N awaiting approval" or "N runs recorded"), Plugins
   (count; "N tabs"; no link — plugins are enabled per team). Others link to their page. Banner "N tasks queued for workers" when
   pending > 0.
2. **Working now** — live claims (claimedAt within `leaseSeconds`, default 3600 s),
   joined to their queued task → run → workflow name; plus `running` nodes of active runs
   (deduped by agent+run+node). When empty: each agent's last finished step
   (success/error/waiting node with the newest `ts`), newest first, top 8.
3. **Workflows** — installed count, a pill per run status, amber "N waiting on your
   approval →" link to `/workflows`, 5 most recent runs linking to run detail.
4. **Needs attention** — `fail` before `warn`; "All clear" when empty:
   - fail: runs with status `error` updated in the last 24 h (one item, names listed) →
     `/runs`
   - fail: an agent's oldest pending queue task older than 1 h (worker not ticking) →
     `/cron-jobs`
   - warn: each run `awaiting_approval` for > 24 h → `/workflows`
   - warn: each claim past its lease (default 1 h) — a worker died mid-task
   - warn: manifest missing, or generated > 1 h ago (regeneration failing)
5. **Teams** — cards (name, id, agent count, lead, "N missing" roles) linking
   `/dashboard?team=`; selected team (from `?team=`, else first) shows members (agent
   links) and ticket lanes linking `/tickets?team=`.
6. **Plugins** — each Kitchen plugin: name, id, tab labels, team types.

## Code

- `src/lib/dashboard/activity.ts` (pure, unit-tested): types, `ago`, `isClaimLive`,
  `workingNow`, `lastSeenByAgent`, `needsAttention`, `teamSummaries`.
- `src/lib/dashboard/overview.ts` (fs, temp-dir tested): `readAgentQueues(teamIds)`,
  `loadDashboard()` (manifest, runs, installed, queues, plugins, `now`).
- `src/lib/workflows/overview.ts`: export `readJsonOrNull`.
- `src/app/dashboard/page.tsx` + `panels.tsx` (server components).
- `AppShell.tsx`: "Dashboard" first in nav; `/dashboard` in `TEAM_SCOPED_ROUTES`.

## Verification

Vitest, lint, build in `~/ClawKitchen-dashboard`; serve on 127.0.0.1:4199 against real
HMX files; Playwright at 1200/1440; compare numbers to the files. PR `--base main`.
Deploying to :7777 is RJ's command (auto-mode blocks it).

# Workflows page (all teams) — design

Date: 2026-09-16 · Status: approved in chat · Ported from JIGGA's jiggaview `/workflows`

## Goal

A top-level `/workflows` page that shows every installed workflow and draws each
recent run as the graph it is, with a waiting approval answerable in place.
First of three ports from JIGGA (then Dashboard, then Chat — separate PRs).

## Out of scope

- JIGGA's workflow **suggestions** (no inference engine in ClawRecipes).
- JIGGA's graph **editor** — the team editor
  (`teams/[teamId]/workflows/[workflowId]/workflows-editor-client.tsx`,
  `WorkflowCanvas.tsx`) is not modified. Installed cards link to it.
- Editing run files from this page. `/runs` is unchanged.
- ClawRecipes changes. Everything needed is already on disk or behind existing routes.

## Data on disk (verified 2026-09-16 on HMX)

- Workflows: `~/.openclaw/workspace-<team>/shared-context/workflows/*.workflow.json` (31).
  Nodes use `type` + `config.agentId`, but some files use the runner shape `kind` +
  `assignedTo.agentId`. Edges are `{id?, from, to, on?}`; `on` is only ever `success`.
- Runs: `shared-context/workflow-runs/<runId>/run.json` (≈260), all in the runner layout
  with timestamp-prefixed, lexically sortable ids. No legacy flat/per-workflow files exist
  (the reader still tolerates them via existing storage helpers, but the page lists only
  runner-layout dirs).
- Run `status`: `queued | running | waiting_workers | awaiting_approval | waiting_handoff |
  needs_revision | completed | rejected | error | canceled`.
- `nodeStates[<nodeId>].status`: `success | error | waiting | running` (+ `ts`, `message`).
- Pending approval: `approvals/approval.json` with `nodeId`, `state|status`.

## Components

### `src/lib/workflows/run-graph.ts` (pure, unit-tested)

```ts
type GraphNodeStatus = "pending" | "running" | "waiting" | "success" | "error" | "skipped";
type GraphNode = { id: string; name: string | null; type: string; agent: string | null;
  status: GraphNodeStatus; message: string | null; ts: string | null; depth: number };
type GraphEdge = { from: string; to: string; on: string };
type RunGraph = { teamId: string; runId: string; workflowId: string; workflowName: string | null;
  status: string; createdAt: string | null; updatedAt: string | null;
  approvalNodeId: string | null; nodes: GraphNode[]; edges: GraphEdge[] };
```

- `buildRunGraph({ teamId, runDirName, run, workflow, approval })`:
  - Topology = workflow file nodes/edges (`type ?? kind`, `config.agentId ?? assignedTo.agentId`).
    If the workflow file is missing/unreadable, nodes come from `nodeStates` keys in
    insertion order with an implicit chain of edges.
  - Nodes that appear in `nodeStates` but not in the file are appended (the file changed
    after the run) so no executed node is hidden: type `removed`, joined by an
    `on: "inferred"` edge from the node that ran before them (nodeStates is in execution
    order), drawn dashed. Both waiting runs on HMX hit this — their approval nodes were
    later removed from the workflow files.
  - A scrollable graph scrolls its selected node into view.
  - Status per node from `nodeStates`; absent → `pending`. When the run is active
    (`running|waiting_workers`; `queued` is unclaimed), a pending node whose predecessors all succeeded is
    shown `running`. Only when the run is `awaiting_approval`: the approval node is
    `approval.json`'s `nodeId` while its status is pending (none if already decided —
    the resume just hasn't landed), else the first node in `waiting`; it is shown `waiting`.
  - `depth` = longest path from roots, cycle-safe (back edges ignored).
- `layoutGraph(nodes)` → placed nodes (column = depth, row = order within column) and
  canvas size; exported for tests.

### `GET /api/workflows/runs?team=&limit=20`

`src/app/api/workflows/runs/route.ts` → `listRunGraphs` in `src/lib/workflows/overview.ts`.
Team ids from the manifest (fallback `listLocalTeamIds`), or the one `team`. Reads every
runner-layout `run.json` (measured: 258 runs / 6.2 MB in 12–17 ms), orders runs
**awaiting approval first** (two on HMX today are months old and would otherwise never be
seen), then by run id descending (timestamp prefix), and takes `limit` (1–200). Only the
returned runs get their `approval.json` and workflow file read; each distinct workflow
file once per request. Response `{ ok: true, runs: RunGraph[], total: number }`; a run
that fails to parse is skipped, not fatal. "Load more" raises `limit` by 20, so polling
keeps every visible run live (no cursor).

### `/workflows` page

- `src/app/workflows/page.tsx` (server, `force-dynamic`): header, **Installed** section —
  cards for every workflow file across teams (or the selected team): name, id, team, cron
  trigger summary; link `/teams/<team>/workflows/<id>`. Then `<WorkflowRunsClient team>`.
- `src/app/workflows/workflow-runs-client.tsx` (client): polls the API every 5s (skipped
  while an approval is in flight), "Load more" raises `limit` by 20 while `runs < total`. Each run card: workflow
  name, team, status pill, created → updated time, "open run →" link to
  `/teams/<team>/runs/<workflowId>/<runId>`, the graph, and a node detail panel.
  Auto-selects the running node, else the waiting node.
- Node detail: id/name, status, type, agent, `nodeStates` message/ts. When it is the
  run's approval node and the run is `awaiting_approval`: **Approve** and **Request
  changes** → existing `POST /api/teams/workflow-runs {teamId, workflowId, runId,
  action: "approve" | "request_changes"}` (writes approval + resumes via the engine).
- `src/components/workflows/RunGraphSvg.tsx`: port of JIGGA `WorkflowGraph` (plain SVG,
  cubic edges, status fill/stroke, pulsing running node, ⏸ on waiting), using
  `layoutGraph`. Scales to fit; horizontal scroll past 1400px.

### Nav

`AppShell.tsx`: add "Workflows" before "Runs"; include `/workflows` in the team-carrying
routes (`navHref`, `syncTeamToCurrentUrl`).

## Testing & verification

- Vitest: `src/lib/workflows/__tests__/run-graph.test.ts` (merge, kind/type shapes, missing
  workflow, extra nodes, active-run inference, approval, depth with cycles, layout) and
  `src/lib/workflows/__tests__/overview.test.ts` (real temp dirs: ordering across teams,
  approval pinning, limit/total, bad run files skipped, workflow file lookup, installed
  list) and `src/app/api/__tests__/workflows-runs-route.test.ts` (param parsing, 400).
- `npm run lint`, `npm run test:run`, `npm run build` in the worktree.
- Run the built app on a spare port against the real HMX workspaces; Playwright
  screenshots next to JIGGA's page; exercise node selection. Approve/Request changes are
  exercised with the POST intercepted in Playwright (assert the request body, fulfil a
  fake response) — never against a live HMX approval, and no scratch team dir is created
  (it would show up in Kitchen's team lists).
- Built and served only from the `~/ClawKitchen-workflows-page` worktree, never
  `~/ClawKitchen` (live plugin).

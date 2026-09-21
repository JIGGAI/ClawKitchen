# Chat page — design

Date: 2026-09-21 · Status: approved in chat · Ported from JIGGA's jiggaview `/chat`.
Remove `docs/superpowers/` before merge.

## Goal

A `/chat` page (sidebar, after Dashboard) to talk to any agent in the same OpenClaw
gateway sessions the Control UI uses: pick an agent, pick or start a thread, read its
history, send a message, watch the reply stream in, stop it.

## Verified (2026-09-21, HMX, OpenClaw 2026.6.6)

- A turn sent through the gateway lands in the session: `chat.history` shows the user
  message and reply, `sessions.list` lists the thread, and `chat`/`agent` events are
  broadcast to connected operator clients (test: `agent:main:kitchen-test:8e85c4f0`,
  ~6 s round trip).
- WebSocket protocol 4: server sends `connect.challenge {nonce}`; client sends
  `{type:"req", id, method:"connect", params:{minProtocol:4, maxProtocol:4, client:{id:
  "gateway-client", version, platform, mode:"backend"}, caps:[], role:"operator", scopes,
  auth:{token}}}`; replies are `{type:"res", id, ok, payload|error}`; events are
  `{type:"event", event, payload, seq}`. Loopback + `gateway-client`/`backend` + token
  needs no device identity.
- `chat.history {sessionKey, limit}` → `{messages:[{role, content, timestamp,
  __openclaw:{id}}], sessionInfo}`; user `content` is a string, assistant `content` is
  `[{type:"text", text}, …]`; other roles/blocks are tool traffic.
- `sessions.list {agentId, limit, includeDerivedTitles, includeLastMessage}` → rows
  `{key, label?, displayName?, derivedTitle?, lastMessagePreview?, updatedAt,
  hasActiveRun}`. `main` currently has no `agent:main:main` (DMs are per channel peer).
- `sessions.create {agentId, label?}` → `{key: "agent:<id>:dashboard:<uuid>"}` (what
  the Control UI's "new chat" makes). `chat.send {sessionKey, message, idempotencyKey}`
  → `{runId, status:"started"}`; `chat.abort {sessionKey}`.
- `chat` event payload `{runId, sessionKey, state: delta|final|aborted|error, message?
  (full text so far on delta), errorMessage?}`.
- `openclaw` is not a ClawKitchen dependency, so Kitchen does not import its client;
  Node 22 has a global `WebSocket`.

## Design

- **Gateway client** `src/lib/chat/gateway-client.ts` (server-only): one lazily
  connected WebSocket per process (kept on `globalThis`), token/port from
  `readOpenClawConfig()` (as `src/lib/gateway.ts` does), scopes `operator.read` +
  `operator.write`. `gatewayRequest(method, params, timeoutMs?)`,
  `onGatewayEvent(listener)`. On close: reject pending requests; the next call
  reconnects. The token never reaches the browser.
- **Pure helpers** `src/lib/chat/messages.ts`: `textOf`, `toChatMessages` (user/assistant
  text only), `mainSessionKey`, `isChatSessionKey` (only `agent:<id>:main` and
  `agent:<id>:dashboard:<id>` — Kitchen never sends into Telegram/cron sessions),
  `toThreads` (Main pinned first, synthesized if it doesn't exist yet; then dashboard
  threads newest first), `toStreamEvent` (chat event → `delta|final|aborted|error`).
- **Routes** (all validate agent id / session key):
  - `GET /api/chat/threads?agent=` → `{threads}`; `POST /api/chat/threads {agent, label?}`
    → `{key}`
  - `GET /api/chat/history?session=` → `{messages, running}` (a session that doesn't
    exist yet → empty)
  - `POST /api/chat/send {session, message}` → `{runId}`
  - `POST /api/chat/abort {session}` → `{aborted}`
  - `GET /api/chat/stream?session=` → Server-Sent Events of that session's `chat`
    events, 15 s heartbeats, closed when the browser disconnects
- **Page** `src/app/chat/page.tsx` (server: agents from the manifest, grouped by team,
  default agent first) + `chat-client.tsx`:
  - rail: search, agents grouped by team, the selected agent's threads
  - header: agent name + id, "+ New thread", "Edit" → `/agents/<id>`
  - messages: bubbles (JIGGA styling), assistant text rendered as Markdown
    (react-markdown + remark-gfm, mapped elements — no typography plugin), local
    timestamps
  - live: an EventSource per open thread; delta → streaming bubble; final/aborted/error
    → refetch history; Stop (abort) while a reply is running
  - composer: textarea, Enter sends, Shift+Enter newline; optimistic user bubble;
    sending while a reply runs is allowed (the gateway queues it as for the Control UI)
  - URL `?agent=&thread=` (replaceState) so a chat can be linked
- **Nav**: "Chat" after Dashboard.

## Testing

Vitest: `messages.ts`; `gateway-client.ts` with a fake `WebSocket` (handshake, request/
response, error, events, reconnect after close); routes with the client mocked
(validation, mapping, SSE framing). Lint/tests/build in the worktree. Live check on a
local build: real short turns to `main` (streaming, Stop, new thread, thread visible in
`sessions.list`), then delete every test thread (`sessions.delete`), including
`agent:main:kitchen-test:8e85c4f0`.

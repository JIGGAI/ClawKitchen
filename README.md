# Claw Kitchen

<p align="center">
  <img src="https://github.com/JIGGAI/ClawRecipes/blob/main/clawcipes_cook.jpg" alt="ClawRecipes logo" width="240" />
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/JIGGAI/ClawKitchen?color=green&label=Latest%20Release" alt="Latest Release">
  <img src="https://img.shields.io/github/license/JIGGAI/ClawKitchen?color=orange" alt="License MIT">
  <img src="https://img.shields.io/github/actions/workflow/status/JIGGAI/ClawKitchen/publish-dual.yml?label=Build" alt="Build Status">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js 18+">
  <br>
  <img src="https://img.shields.io/badge/OpenClaw-Plugin-6366f1" alt="OpenClaw Plugin">
  <img src="https://img.shields.io/badge/Web-Dashboard-0ea5e9" alt="Web Dashboard">
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Team-Management-8b5cf6" alt="Team Management">
</p>

Local-first UI companion for **ClawRecipes** (OpenClaw Recipes plugin).

## Prerequisites
- OpenClaw installed and on PATH (`openclaw`)
- ClawRecipes plugin installed/linked so `openclaw recipes ...` works

---

## Run as an OpenClaw plugin (@jiggai/kitchen)

ClawKitchen can be loaded as an OpenClaw plugin so it runs locally on the orchestrator.

### 1) Install / load the plugin

**Recommended (end users):** install the published plugin package (ships with a prebuilt `.next/` so you don’t run any npm commands).

```bash
openclaw plugins install @jiggai/kitchen

# If you use a plugin allowlist (plugins.allow), you must explicitly trust it:
openclaw config get plugins.allow --json
# then add "kitchen" (and "recipes") and set it back, e.g.
openclaw config set plugins.allow --json '["memory-core","telegram","recipes","kitchen"]'
```

Edit your OpenClaw config (`~/.openclaw/openclaw.json`) and add:

```json5
{
  "plugins": {
    // If you use plugins.allow, ensure kitchen is allowed.
    "allow": ["kitchen", "recipes"],

    "entries": {
      "kitchen": {
        "enabled": true,
        "config": {
          "enabled": true,
          "dev": false,
          "host": "127.0.0.1",
          "port": 7777,
          "authToken": ""
        }
      }
    }
  }
}
```

Notes:
- Plugin id is `kitchen` (from `openclaw.plugin.json`).
- If `plugins.allow` is present, it **must** include `kitchen` or config validation will fail.

### 2) Restart the gateway

Config changes require a gateway restart:

```bash
openclaw gateway restart
```

### 3) Confirm Kitchen is running

---

## Workflows: experimental + `llm-task` enablement

- **Workflows are experimental** and the schema/runner behavior may change. If you rely on workflows in production, pin versions and expect breaking changes.
- Workflow **LLM nodes** require the built-in optional plugin **`llm-task`** to be enabled.

Enable it with:

```bash
openclaw plugins enable llm-task
openclaw gateway restart
```

Then confirm Kitchen is running:

```bash
openclaw kitchen status
openclaw kitchen open
```

Then open:
- http://127.0.0.1:7777

### Troubleshooting: “Tool not available: gateway” on Channels/Bindings

If you see errors like `Tool not available: gateway` while loading **Channels** or workflow approval bindings,
you are almost certainly running an **older Kitchen plugin build** that still tried to fetch bindings
via the Gateway tool.

Fix:

```bash
openclaw plugins update
openclaw gateway restart
```

Notes:
- A gateway restart is required after plugin updates and many config changes.
- As a *last resort* you can enable the `gateway` tool via `gateway.tools.allow`, but that weakens hardening
  and should not be required for normal Kitchen usage.


---

## Tailscale / remote access (recommended)

This is intended for **Tailscale-only** remote access.

### 1) Pick an auth token

Use a long random string. Examples:

```bash
# base64 token
openssl rand -base64 32

# hex token
openssl rand -hex 32

# node (URL-safe)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 2) Bind to your Tailscale IP

Update OpenClaw config:

```json5
{
  "plugins": {
    "entries": {
      "kitchen": {
        "enabled": true,
        "config": {
          "host": "<tailscale-ip>",
          "port": 7777,
          "authToken": "<token>",
          "dev": false
        }
      }
    }
  }
}
```

Restart:
```bash
openclaw gateway restart
```

### 3) Connect

Open in a browser:
- `http://<tailscale-ip>:7777`

Authentication:
- HTTP Basic Auth
  - username: `kitchen`
  - password: `<token>`

Safety rule:
- If `host` is not localhost, `authToken` is required (unless you explicitly set `KITCHEN_AUTH_MODE=off`, which is not recommended).

### Optional: allow localhost access without Basic Auth (for headless QA)

If you bind Kitchen to a non-localhost host (Tailscale/LAN) you may still want **local/headless** access without dealing with Basic Auth.

Set:
- `KITCHEN_AUTH_MODE=local`

Behavior:
- `on` (default): Basic Auth required for all requests when `host` is not localhost.
- `local`: Basic Auth is **skipped only for loopback requests** (`127.0.0.1` / `::1`). Remote/Tailscale requests still require Basic Auth.
- `off`: disables Basic Auth entirely (**dangerous**, CI/dev only).

How to set it depends on how you run the OpenClaw gateway. If you're using the systemd user service (`openclaw-gateway.service`), add a drop-in:

```ini
[Service]
Environment=KITCHEN_AUTH_MODE=local
```

Then restart the gateway.

---

## Goals
See [docs/GOALS.md](docs/GOALS.md).

## Notes
- This app shells out to `openclaw` on the same machine (local-first by design).
- Phase 2 will add marketplace/search/publish flows.

---

## Troubleshooting

### Stop Kitchen

Kitchen runs in-process with the OpenClaw Gateway. The supported way to stop it is to disable the plugin and restart the gateway:

```bash
openclaw plugins disable kitchen
openclaw gateway restart
```

(You can re-enable it later with `openclaw plugins enable kitchen` and another gateway restart.)

### 500 errors for `/_next/static/chunks/*.js` (broken styles / blank UI)

If you see 500s when loading Next static chunk files (for example `/_next/static/chunks/<hash>.js`), it usually means Kitchen is running with `dev: false` but the local `.next/` build output is missing or out of date.

Fix:

```bash
cd /home/control/clawkitchen
npm install
npm run build
openclaw gateway restart
```

Then hard refresh the browser.

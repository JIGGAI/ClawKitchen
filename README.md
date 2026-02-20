# Claw Kitchen

Local-first UI companion for **ClawRecipes** (OpenClaw Recipes plugin).

Phase 1 focus:
- list recipes (builtin + workspace)
- edit recipes (including builtin) and save back to disk
- scaffold agents/teams via `openclaw recipes scaffold` / `scaffold-team`

## Prerequisites
- OpenClaw installed and on PATH (`openclaw`)
- ClawRecipes plugin installed/linked so `openclaw recipes ...` works

---

## Option A: Run as a standalone app (dev)

```bash
npm install
npm run dev -- --port 3001
```

Open:
- http://localhost:3001

Notes:
- This is the fastest iteration loop.
- This mode is local-only unless you separately expose the port.

---

## Option B: Run as an OpenClaw plugin (@jiggai/kitchen)

ClawKitchen can be loaded as an OpenClaw plugin so it runs locally on the orchestrator.

### 1) Load the plugin from a local path (pre-release testing)

Before publishing to npm, you can load it directly from the repo by adding the repo path to `plugins.load.paths`.

Edit your OpenClaw config (`~/.openclaw/openclaw.json`) and add:

```json5
{
  "plugins": {
    "load": {
      "paths": ["/home/control/clawkitchen"]
    },

    // If you use plugins.allow, ensure kitchen is allowed.
    "allow": ["kitchen", "recipes"],

    "entries": {
      "kitchen": {
        "enabled": true,
        "config": {
          "enabled": true,
          "dev": true,
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

```bash
openclaw kitchen status
openclaw kitchen open
```

Then open:
- http://127.0.0.1:7777

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
          "dev": true
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
- If `host` is not localhost, `authToken` is required.

---

## Goals
See [docs/GOALS.md](docs/GOALS.md).

## Notes
- This app shells out to `openclaw` on the same machine (local-first by design).
- Phase 2 will add marketplace/search/publish flows.

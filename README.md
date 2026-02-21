# Claw Kitchen

Local-first UI companion for **ClawRecipes** (OpenClaw Recipes plugin).

## Prerequisites
- OpenClaw installed and on PATH (`openclaw`)
- ClawRecipes plugin installed/linked so `openclaw recipes ...` works

---

## Run as an OpenClaw plugin (@jiggai/kitchen)

ClawKitchen can be loaded as an OpenClaw plugin so it runs locally on the orchestrator.

### 1) Install / load the plugin

**Recommended (end users):** install the published plugin package (ships with a prebuilt `.next/` so you don’t run any npm commands).

**Developer/testing:** you can also load it directly from a local repo path via `plugins.load.paths`.

Edit your OpenClaw config (`~/.openclaw/openclaw.json`) and add:

```json5
{
  "plugins": {
    // Local developers only
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
- If `host` is not localhost, `authToken` is required.

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

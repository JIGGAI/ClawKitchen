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

```bash
openclaw plugins install @jiggai/kitchen

# If you use a plugin allowlist (plugins.allow), you must explicitly trust it:
openclaw config get plugins.allow --json
# then add "kitchen" (and "recipes") and set it back, e.g.
openclaw config set plugins.allow --json '["memory-core","telegram","recipes","kitchen"]'

openclaw gateway restart
openclaw plugins list
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

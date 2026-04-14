# Install and access

## Install the plugin

ClawKitchen runs as an OpenClaw plugin.

A typical local install flow looks like this:

```bash
git clone https://github.com/JIGGAI/ClawKitchen.git ~/clawkitchen
openclaw plugins install --link ~/clawkitchen
openclaw plugins enable kitchen
openclaw gateway restart
```

Then verify that the plugin is loaded:

```bash
openclaw plugins list
```

You should see `kitchen` as enabled and available.

## Open the UI

Once enabled, ClawKitchen serves a local web UI.

Depending on your setup, that might mean:

- a localhost-only URL for direct machine access
- a Tailscale- or LAN-reachable address if you intentionally exposed it

ClawKitchen is designed first for local or self-hosted operation, not as an open public web app.

## Authentication basics

ClawKitchen supports auth-related plugin config such as:

- host
- port
- auth token
- auth mode
- optional QA token

The practical rule is simple:

- local access can be lighter-weight
- remote access should stay protected

If you expose Kitchen beyond localhost, keep auth enabled and be deliberate about how that access works.

## QA and headless access

ClawKitchen also supports a QA-oriented token flow for browser automation and testing.

That is especially useful for:

- screenshots
- headless verification
- browser tests that cannot easily complete an interactive auth prompt

Use the dedicated page for that flow:

- [QA / auth](/clawkitchen/qa-auth)

## CLI commands

ClawKitchen registers several CLI commands under `openclaw kitchen`:

```bash
# Check if Kitchen is running, its URL, uptime, and installed plugins
openclaw kitchen status

# Restart Kitchen (clears plugin cache, reloads plugin bundles)
openclaw kitchen restart

# Print the Kitchen URL
openclaw kitchen open

# Manage Kitchen plugins
openclaw kitchen plugins list
openclaw kitchen plugins install <package>
openclaw kitchen plugins remove <package>
```

### Status

`openclaw kitchen status` probes the running Kitchen server and returns:

- **running** — whether Kitchen is currently serving requests
- **url** — the configured address
- **startedAt** — when the current Kitchen process started (ISO timestamp)
- **plugins** — list of installed Kitchen plugins with id, name, version, and supported team types

Example output:

```json
{
  "ok": true,
  "running": true,
  "url": "http://100.103.210.102:7777",
  "startedAt": "2026-04-06T03:07:00.000Z",
  "plugins": [
    {
      "id": "marketing",
      "name": "Marketing Suite",
      "version": "0.3.0",
      "teamTypes": ["marketing-team", "claw-marketing-team"]
    }
  ]
}
```

### Restart

`openclaw kitchen restart` is the fastest way to pick up plugin updates without restarting the entire gateway.

What it does:

- Stops the running Kitchen HTTP server
- Clears the in-memory plugin discovery cache
- Starts Kitchen again with fresh plugin state

If Kitchen is running inside the gateway process (the normal case), the restart happens in-place. If you run the command from a separate terminal, it will direct you to `openclaw gateway restart` instead.

Common reasons to restart:

- Installed or updated a Kitchen plugin (`openclaw kitchen plugins install ...`)
- Changed plugin configuration
- Plugin tabs showing stale content
- Plugin API routes are failing and you need a fresh plugin/bootstrap load

## When a restart is needed

ClawKitchen reflects live OpenClaw and plugin state, but some changes still require a restart, especially when you:

- install, update, or remove Kitchen plugins
- enable or disable plugins
- change plugin allowlists or runtime config
- change channel or binding config that the running process must reload

For plugin changes, use `openclaw kitchen restart`. For deeper config changes, use `openclaw gateway restart`.

If a remote install shows plugin route failures mentioning `better-sqlite3-...`, you are likely running an older Kitchen or plugin build that still loads sqlite bindings too early during bootstrap. Update both packages, then restart Kitchen.

## A good expectation to set

Kitchen is best understood as a live operational UI layered on top of an existing runtime.

That means install and access problems are often really runtime/config problems wearing a UI-shaped hat.

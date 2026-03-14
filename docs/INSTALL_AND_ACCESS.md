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

## When a restart is needed

ClawKitchen reflects live OpenClaw and plugin state, but some changes still require a restart, especially when you:

- enable or disable plugins
- change plugin allowlists or runtime config
- change channel or binding config that the running process must reload

If Kitchen and the underlying runtime seem out of sync, a gateway restart is one of the first things to verify.

## A good expectation to set

Kitchen is best understood as a live operational UI layered on top of an existing runtime.

That means install and access problems are often really runtime/config problems wearing a UI-shaped hat.

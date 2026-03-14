# QA / auth

## What this is for

ClawKitchen can be protected by HTTP Basic auth when it is bound to a non-localhost host such as a Tailscale or LAN-accessible address.

That is sensible for remote access, but it can make automated QA and browser tooling awkward.

To make testing easier, ClawKitchen supports an optional **QA-only bootstrap token** flow that seeds a short-lived session cookie.

## How it works

If `qaToken` is configured:

1. visit any Kitchen URL with `?qaToken=<token>` once
2. Kitchen sets an HttpOnly cookie named `kitchenQaToken`
3. Kitchen redirects back to the same URL with `qaToken` removed
4. subsequent requests use the cookie instead of triggering the normal Basic auth prompt

## Important notes

- this is **disabled by default**
- the cookie lifetime is short-lived (about 15 minutes)
- it is intended for **dev and QA**, not broad production exposure

## Example config

Set `qaToken` in the Kitchen plugin config alongside `authToken`:

```json
{
  "kitchen": {
    "enabled": true,
    "host": "100.x.y.z",
    "port": 7077,
    "authToken": "<basic-auth-password>",
    "qaToken": "<qa-bootstrap-token>"
  }
}
```

## Example usage

Open a page once like this:

```text
http://HOST:PORT/tickets?qaToken=YOUR_QA_TOKEN
```

After that redirect, the browser should be authorized for a short period without another prompt.

## Why this matters

This is especially useful for:

- screenshot capture
- Playwright/browser automation
- headless testing
- temporary QA access without fighting a Basic auth prompt on every run

## Troubleshooting

If you still get `401 Unauthorized` and a Basic auth challenge:

- verify `qaToken` is actually configured in the running Kitchen instance
- make sure you are hitting Kitchen directly, not a separate proxy applying auth before Kitchen sees the request
- verify you are using the same host/path scope that the cookie is expected to cover

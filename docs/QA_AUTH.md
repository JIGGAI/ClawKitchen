# ClawKitchen QA Auth (headless-friendly)

ClawKitchen can optionally be protected by HTTP Basic auth when binding to a non-localhost host (e.g. Tailscale IP).

For automated/headless QA (Playwright, etc.), HTTP Basic auth prompts can be awkward.
ClawKitchen supports an **optional QA-only bootstrap token** that sets a short-lived session cookie.

## How it works

If `qaToken` is configured:

1. Visit any Kitchen URL with `?qaToken=<token>` once.
2. Kitchen sets an HttpOnly cookie `kitchenQaToken` (15 minutes) and **redirects** to the same URL with `qaToken` removed.
3. Subsequent requests include the cookie and are authorized without triggering the Basic auth prompt.

Notes:
- This is **disabled by default**.
- The cookie lifetime is **15 minutes**.
- Intended for **dev/QA only**.

## Configure

Set `qaToken` in the Kitchen plugin config (alongside `authToken`). Example:

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

## Use (curl)

```bash
# First request seeds cookie (note: follow redirect and store cookies)
curl -i -c cookies.txt 'http://HOST:PORT/tickets?qaToken=YOUR_QA_TOKEN'

# Subsequent request uses cookie
curl -i -b cookies.txt 'http://HOST:PORT/tickets'
```

## Use (Playwright)

Navigate once to:

```
http://HOST:PORT/tickets?qaToken=YOUR_QA_TOKEN
```

Then proceed normally; the cookie is set for ~15 minutes.

## Troubleshooting

If you still get `401 Unauthorized` with `WWW-Authenticate: Basic`:

- Verify `qaToken` is actually configured in the running Kitchen instance.
- Ensure you are hitting the Kitchen server directly (not a separate reverse proxy applying Basic auth *before* Kitchen can read the query params).

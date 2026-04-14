# Troubleshooting

## Kitchen loads but data looks wrong or stale

ClawKitchen reflects live runtime and file-backed state.

If the UI looks stale, first check whether:

- the relevant plugin is enabled
- the underlying OpenClaw process needs a restart
- the underlying files or workspace actually changed the way you expect

## A page says a plugin feature is unavailable

Many Kitchen surfaces are thin wrappers over plugin/runtime capabilities.

If a feature says support is unavailable, verify the corresponding plugin is loaded and that Kitchen is interpreting current runtime state correctly.

Examples include workflow-related optional plugins such as `llm-task`.

## Workflows exist but runs do not appear

Check the workflow's team context and verify the runtime side that actually processes or schedules work is operating correctly.

Kitchen can surface workflow definitions and run state, but the execution path still depends on the underlying OpenClaw/runtime setup.

## Channel changes do not seem to take effect

Bindings/config changes may require a restart depending on what changed.

If the config looks correct in the UI but behavior has not updated, restart the relevant runtime and test again.

## Cron jobs are missing or not behaving as expected

Check:

- whether the recipe or team actually installed cron jobs
- whether cron installation mode was set to off, prompt, or on during scaffold
- whether the team's `notes/cron-jobs.json` mapping exists and looks correct
- whether the job is currently enabled

## Builtin vs custom recipe confusion

Remember:

- builtin recipes come from the plugin bundle
- custom recipes live in your workspace and are the safer place for your own edits

If you need something editable and reusable, prefer a custom recipe rather than mutating a bundled default.

## Remote or auth issues

If you are accessing Kitchen remotely, verify host and auth settings and avoid assuming localhost rules still apply.

For automated browser or test flows, use the documented QA auth path instead of fighting an interactive prompt.

## Plugin tabs not showing or showing stale content

Kitchen caches discovered plugins in memory. If you installed, updated, or removed a Kitchen plugin and the UI hasn't caught up:

```bash
openclaw kitchen restart
```

This clears the plugin cache and reloads all plugin bundles without restarting the full gateway.

If `restart` reports Kitchen is not running, check `openclaw kitchen status` first.

If plugin routes return `500` on a remote Kitchen install, check the gateway/Kitchen logs before assuming it is an enablement issue. In particular, errors like:

- `Failed to load external module better-sqlite3-...`
- `Cannot find module 'better-sqlite3-...'`

mean the plugin bootstrap is crashing during module load. Update Kitchen and the affected plugin to a build that lazy-loads sqlite bindings, then restart Kitchen so plugin discovery can complete.

## Checking Kitchen health

The quickest way to verify Kitchen state:

```bash
openclaw kitchen status
```

This tells you whether Kitchen is running, when it started, and which plugins are installed. If `startedAt` is recent, the server restarted recently. If `running` is false, Kitchen isn't serving — check gateway logs.

## Useful debugging mindset

When something looks wrong in Kitchen, ask two questions:

1. is the underlying file or runtime state actually correct?
2. is Kitchen failing to reflect that state accurately?

That distinction helps you find root causes much faster.

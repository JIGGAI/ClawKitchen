# Goals

## What Goals are

Goals are the durable intent layer in ClawKitchen.

If tickets represent concrete work items moving through a workflow, goals represent the larger outcomes that should survive beyond any one ticket.

## Canonical storage root

Goals are stored as markdown files in the OpenClaw global workspace:

`~/.openclaw/workspace/notes/goals/`

Each goal is a single file:

`~/.openclaw/workspace/notes/goals/<id>.md`

## Why this matters

This is another strong example of the ClawKitchen model:

- the UI helps you manage the data
- the data itself remains in durable, inspectable files

That makes goals easier to review, back up, script against, and understand outside the browser.

## Frontmatter schema

Goals are markdown files with YAML frontmatter:

```yaml
---
id: increase-trial-activation
title: Increase trial activation
status: planned # planned|active|done
tags: [growth, onboarding]
teams: [development-team, marketing-team]
updatedAt: 2026-02-17T00:30:00Z
---
```

The body below the frontmatter is freeform markdown.

## Multi-team association

A goal that spans multiple teams is represented by **one canonical goal file**.

Use `teams: [...]` to associate it with multiple teams. The UI supports filtering goals by team.

## Good use cases for Goals

Use goals when something is:

- bigger than one ticket
- likely to survive several implementation cycles
- shared across teams
- important enough to keep visible even when the active ticket list changes

## Safety and guardrails

The Goals API protects the goal storage root, rejects path traversal, and validates goal ids.

That keeps the feature grounded in a safe, constrained file model instead of turning it into arbitrary file mutation.

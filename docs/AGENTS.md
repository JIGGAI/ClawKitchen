# Agents

## What the Agents surface is

The ClawKitchen home page is effectively the installed-agents dashboard for the current machine.

It shows the agents available right now and groups them by team workspace when that can be inferred.

## Why this matters

This gives you a fast answer to practical questions like:

- what agents are installed here right now?
- are they part of a team workspace or personal/unassigned?
- which one do I need to inspect, edit, or debug?

## Grouping behavior

ClawKitchen groups agents by workspace convention when possible.

That means the grouping comes from the local filesystem and workspace structure, not from a detached cloud registry.

If an agent is not clearly tied to a team workspace, it appears as personal or unassigned.

## What you can edit in an agent

The agent editor exposes a few important tabs:

- **Identity** — name, emoji, theme, avatar
- **Config** — a thin config slice such as model id
- **Skills** — workspace-installed skills for that specific agent
- **Files** — editable agent files

## Why the agent page is useful

This is one of the places where ClawKitchen is at its most practical.

Instead of forcing you to hunt through files and config by hand, it gives you a direct operating surface for the parts of an agent that change most often.

## Important mental model

This is not a fake profile editor sitting on top of a mystery backend.

ClawKitchen is editing real config and real files associated with the agent workspace.

That is why the page matters: it gives you a friendlier interface for the same durable artifacts the rest of the system uses.

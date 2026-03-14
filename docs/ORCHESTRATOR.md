# Orchestrator and advanced operations

## What the Orchestrator panel is

The Orchestrator panel is an advanced operational surface for swarm or orchestrator-style team setups.

Its main job is to give you visibility into what exists and what is running.

## What it can show

Depending on the team, the panel can surface:

- whether an orchestrator exists at all
- the orchestrator agent id and workspace
- tmux sessions
- git worktrees and branches
- active task summary
- settings or config paths

## Important limitation

ClawKitchen is intentionally **read-only** here in the most important sense.

It can show status and useful pointers, but it is not the thing that attaches to tmux or drives the whole swarm directly.

That is a good boundary.

## Why this is still useful

Even read-only visibility is extremely valuable when you need to answer questions like:

- is the orchestrator installed?
- is tmux running?
- what worktrees exist?
- where do I change the relevant settings?
- is there active task state right now?

## Human approval recommendation

For any advanced automation that publishes, deploys, or sends external messages, keep a human approval step in the loop.

That guidance belongs here because orchestrator-style systems can become powerful quickly.

## Who this page is for

This page is mainly for operators and advanced users.

If you are just getting started with Kitchen, focus first on Recipes, Teams, Workflows, Runs, and Tickets.

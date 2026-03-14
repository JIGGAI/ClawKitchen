# Cron jobs

## What the Cron Jobs page shows

ClawKitchen's Cron Jobs page focuses on **recipe-installed cron jobs**.

That distinction matters: this page is meant to surface the jobs created through team and recipe scaffold flows, not every possible scheduled thing on the machine.

## What you can do there

The current surface supports practical operational actions like:

- viewing jobs
- filtering by team
- enabling or disabling jobs
- running a job now
- deleting disabled jobs
- inspecting raw job details

## Why cron matters here

Recipes and teams can define ongoing automated behavior.

That is powerful, but it also means people need a visible place to inspect what is scheduled and whether it is active.

The Cron Jobs page is that checkpoint.

## Team cron vs global cron page

There are really two related experiences:

- the **global** Cron Jobs page
- the **team** cron view inside a Team editor

Together, those give you both fleet-level visibility and team-level management.

## Cron installation mode

ClawKitchen also exposes a setting for cron installation behavior during scaffold.

That setting controls whether recipe-declared cron jobs are:

- installed automatically
- prompted
- or not installed automatically

Because cron can trigger messages or automated work, conservative defaults are often the right choice.

## A good operator habit

Treat the Cron Jobs page like a safety check after scaffold: verify what was installed, what is enabled, and what should remain active before you move on.

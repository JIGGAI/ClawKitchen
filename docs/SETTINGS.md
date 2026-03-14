# Settings

## What Settings is today

The current Settings page in ClawKitchen is intentionally narrow.

It is not a giant everything-admin panel. Right now it focuses on a small number of behaviors that affect scaffold and automation decisions.

That is a good thing: the page is trying to control the important defaults without pretending the entire runtime should be configured only through Kitchen.

## Cron installation mode

The most important current setting is **cron installation mode**.

This controls what ClawKitchen should do when a recipe declares cron jobs during scaffold.

Typical modes are:

- install automatically
- prompt
- do not install automatically

## Why this setting matters

Cron jobs can trigger recurring work, reminders, notifications, and other automated behavior.

That means this is not a cosmetic preference. It affects operational safety and how much automation gets turned on by default.

## Recommendation

If you are unsure, use the more conservative option and review jobs before enabling broad automation.

That lines up with the rest of the ClawKitchen philosophy: visible, understandable, file-backed, and deliberate.

## What not to expect

At the moment, Settings is not meant to be a complete replacement for every OpenClaw config surface.

Think of it as a focused operator settings page, not a full-control cockpit.

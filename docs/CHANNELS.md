# Channels and bindings

## What a binding is

A channel binding tells OpenClaw how to connect a messaging surface to your runtime.

In practical terms, that means ClawKitchen's Channels page is where you manage the wiring for provider-backed communication.

## What the page supports

The current Channels page is intentionally practical and close to the metal.

You can:

- list bindings
- add a binding
- edit raw JSON-backed config
- delete a binding with explicit confirmation

## Why this page matters

A lot of higher-level workflows depend on messaging bindings existing and being correct.

Examples include:

- notifications
- approval flows
- reminders
- inbound channel interactions

So although the Channels page may look simple, it controls important operational plumbing.

## How to think about it

This is not a glossy integrations marketplace. It is an operator surface for real runtime configuration.

That means edits here should be deliberate, especially when a binding is already being used by workflows, reminders, or approval flows.

## Restart expectations

Some channel/config changes may require a runtime restart before the running process fully reflects them.

If the config looks right in the UI but behavior has not updated yet, verify whether the underlying OpenClaw process needs to be restarted.

## A good practice

When you create a new binding, test it quickly with one small message or workflow path before you depend on it in larger automations.

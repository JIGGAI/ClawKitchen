# Practical examples

## Create a team from a builtin recipe

A common first use of ClawKitchen is turning a bundled recipe into a real working team.

Typical flow:

1. open **Recipes**
2. choose a builtin team recipe
3. select **Create team**
4. set the team id
5. decide whether cron should be installed during scaffold
6. finish scaffold
7. open the new team in the Team editor

This is the fastest path from “interesting template” to “real operating workspace.”

## Create an agent from a recipe

Typical flow:

1. open **Recipes**
2. select an agent recipe
3. choose **Create agent**
4. set the agent id and display details
5. open the agent editor
6. refine identity, config, files, or skills

## Use the Team editor to inspect a scaffolded team

Typical flow:

1. scaffold a team
2. open its team page
3. inspect the tabs for recipe, agents, files, cron, and workflows
4. verify that the generated structure matches what you expected

This is where ClawKitchen starts to pay off as an operator tool instead of just a creation wizard.

## Add a workflow from an example template

Typical flow:

1. open a team
2. go to **Workflows**
3. add a blank workflow or an example template
4. inspect the generated definition
5. edit it to match your actual process
6. monitor the resulting runs

## Inspect a run after a workflow triggers

Typical flow:

1. open **Runs**
2. filter by team or workflow if needed
3. open the relevant run detail
4. check status, timing, and approval state
5. use that run detail to understand what happened

## Manage a file-backed ticket

Typical flow:

1. open **Tickets**
2. find the ticket in backlog or in-progress
3. open the detail page
4. add comments or ownership updates
5. move it through testing to done

## Add or fix a channel binding

Typical flow:

1. open **Channels**
2. add or select a provider binding
3. edit the JSON-backed config carefully
4. save the change
5. restart runtime if the provider/config path requires reload

## Inspect recipe-installed cron jobs

Typical flow:

1. open **Cron Jobs**
2. filter by team if needed
3. verify which jobs are enabled
4. run one manually if you need a quick sanity check
5. disable or remove jobs you do not want active

## A useful progression for new users

If you are learning the product for the first time, this order works well:

1. scaffold a team from Recipes
2. inspect that team in Teams
3. add or inspect a workflow
4. watch the resulting runs
5. use Tickets and Goals to manage ongoing work
6. use Channels and Cron Jobs to wire the team into real operations

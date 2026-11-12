---
name: change-targeting
description: Change who gets a LaunchDarkly flag without surprising anyone — confirm the environment, read the current targeting, respect approval settings, prefer a gradual or guarded rollout in production, and verify the change took effect. Use when the user asks to turn a flag on or off, roll a feature out to a percentage, a customer or a segment, add someone to a flag, or roll a feature back.
argument-hint: the flag, the environment, and who should get which variation
allowed-tools: mcp__launchdarkly__get-flags, mcp__launchdarkly__get-environment, mcp__launchdarkly__load-skill, mcp__launchdarkly__toggle-flag, mcp__launchdarkly__update-flag-targeting, mcp__launchdarkly__update-targeting-rules, mcp__launchdarkly__update-rollout, mcp__launchdarkly__start-guarded-rollout, mcp__launchdarkly__create-approval-request, mcp__launchdarkly__get-approval-requests, mcp__launchdarkly__get-flag-status-across-envs
---

# A flag change is a production deploy

Changing targeting changes what users get, immediately, without a code review.
Treat it with the same care as a deploy: know the current state, make the
smallest change, and check the result.

## 1. Confirm the environment and the intent

Never assume production. Restate the change as "In `<env>`, serve `<variation>`
to `<who>`" and confirm it when the user did not name the environment.

## 2. Read the current targeting

`get-flags` with `flagKey` and `env` returns the rules, targets and default rule,
with an `_id` on every rule and clause. Plan the change against what is there:
adding a value to an existing clause is safer than adding a new rule that might
shadow others, and rule order decides who matches first.

## 3. Check whether the change needs approval

`get-environment` returns the environment's approval settings. When approvals
are required, create the change with `create-approval-request` and share its
link; a person approves it in LaunchDarkly, not you. Check the outcome with
`get-approval-requests` when the user says it was reviewed.

## 4. Make the smallest change with the right tool

- Targeting on or off: `toggle-flag`. Off serves everyone the off variation.
  On applies the existing targets and rules, and everyone they miss gets the
  default rule's variation, so check that variation in step 2 first.
- Specific users or contexts: `update-flag-targeting`.
- Rules and clauses: `update-targeting-rules`. Load the
  `feature-flags/launchdarkly-flag-targeting` guide with `load-skill` first; it
  covers whether the flag's evaluation context can match the rule.
- Percentage of everyone: `update-rollout`.
- A production release with metrics to watch: `start-guarded-rollout`, after
  loading the `feature-flags/launchdarkly-guarded-rollout` guide. It rolls back
  on a regression only when automatic rollback is on; otherwise a regression
  raises an alert and the rollout continues. Say which one the user is getting.

## 5. Verify and report

Read the flag again with `get-flags` and confirm the targeting is what you
intended. Report the before and after in one line each, and how to undo it.

## Anti-patterns

- **Turning a flag on in production to test it.** Use a target or a small
  rollout.
- **Removing and re-adding clauses to change values.** Edit the clause in place
  by its `_id`.
- **Applying around an approval.** A required approval is the team's control,
  not an obstacle.

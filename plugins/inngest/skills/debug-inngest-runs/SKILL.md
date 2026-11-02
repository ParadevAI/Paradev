---
name: debug-inngest-runs
description: Find out why an Inngest function failed, stalled, or never ran — locate the run from the event or function, read its trace step by step, and fix or rerun only after the cause is known. Use when the user reports a failing or stuck Inngest function, a background job that did not happen, an event that triggered nothing, or asks to rerun, cancel, or replay runs.
argument-hint: the function, event, run ID, or symptom to investigate
allowed-tools: mcp__inngest__*
---

# Debug an Inngest run

A run is a function execution made of steps, each retried on its own. The
trace records what every step did, so the cause is almost always in it. Read
it before you touch code or press rerun.

## 1. Confirm where you are looking

Inngest keeps production, branch, and custom environments apart, and an app
can be synced to one and not another. Use `list_envs` when the user does not
name one, and say which environment you searched. A run missing in production
is often a run that went to a branch environment.

## 2. Find the run from what the user has

- **A run ID:** `get_run`.
- **An event that should have triggered something:** `get_event_runs` lists
  the runs it started. None at all means no function matched the event: check
  the event name and the trigger in `get_function`, and check with `get_apps`
  that the app is synced in this environment.
- **A function name:** `list_function_runs` with a status filter (failed,
  running) and a time range. `list_functions` finds the function ID first.

## 3. Read the trace, not only the final error

`get_run_trace` shows each step, its attempts, and its output or error. Look
for the first step that went wrong, not the last error the run reported.

- A step that fails on each attempt with the same error is a bug in that step.
- A step that fails once and then succeeds is a flaky dependency. Retries
  already handled it.
- A run that stays in "running" is usually waiting on purpose: a
  `step.sleep`, a `step.waitForEvent` with a long timeout, or concurrency and
  throttle limits that hold it in the queue. Read the function's configuration
  before you call it stuck.

## 4. Fix first, then rerun or replay

`rerun` runs the function again from the start with the same event. It does
not continue from the failed step. Rerun only after the fix is deployed and
synced, or the new run fails the same way. For a test, `invoke_function` or
`send_event` with a payload you chose is cleaner than replaying real traffic.

`cancel_run` stops a run that is in progress. Ask the user before you cancel,
rerun, or send events in production. These calls have side effects for real
users and downstream systems.

## 5. Report what you found

Give the run ID, the step that failed, the error and the attempt count, and
the cause. If the cause is in user code, point to the step's code in the
repository. If you could not see a cause, say what you checked.

## Anti-patterns

- **Rerunning before you understand the failure.** A second failed run hides
  the first and can repeat its side effects.
- **Trusting the Dev Server for a production question.** Local runs show
  local code. Production behavior is in the Cloud environment.
- **Treating "running" as "stuck".** Sleeps, waits, and flow control are
  normal. Read the configuration first.

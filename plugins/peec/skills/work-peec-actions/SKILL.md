---
name: work-peec-actions
description: Work through Peec AI's recommended actions and keep the record honest — site fixes first, decline false positives with a reason, log work you shipped as completed actions on the date it shipped so Peec's Impact view measures it, and check before and after. Use when the user asks what to do next in Peec, wants to triage or clean up Peec actions, record shipped content or fixes in Peec, or see whether a change moved AI visibility.
argument-hint: what to work on, or work you shipped to record
allowed-tools: mcp__peec__list_projects, mcp__peec__list_topics, mcp__peec__list_prompts, mcp__peec__list_actions, mcp__peec__get_action, mcp__peec__list_action_platforms, mcp__peec__get_actions, mcp__peec__get_brand_report, mcp__peec__get_url_report, mcp__peec__get_url_content, mcp__peec__get_agent_visits
---

# Actions are the plan, and Impact is the proof

Peec measures an action against the date it was completed. Work that was never
logged cannot be measured, and a queue full of stale suggestions hides the few
that matter. Keep both clean.

## 1. Read the queue in the order Peec ranks it

Run `list_projects`, then `list_actions` with `statuses: ["PENDING", "ACCEPTED"]`
(ordered by `impact`). Group them as Peec does:

1. **Site fixes** (`SEO_ISSUE`, `ROBOTS_TXT`): these block everything else.
2. **Wrong claims** (`CONTRADICTIONS_OWNED_SOURCES`, `CONTRADICTIONS_EXTERNAL_SOURCES`).
3. **Your own pages** (`CONTENT_OPTIMISATION`, `CONTENT_BRIEF`, `CATEGORY_SITUATION_BRIEF`).
4. **Mentions elsewhere** (`TEMPLATE_ACTION`, `target: earned`).

Run `get_action` with `steps` only for the action you are about to work on.

## 2. Check an action before you accept it

- A site fix names a URL. Load it yourself. A scanner probe such as
  `/.env`, `/@fs/...` or `/wp-admin` is not a page to restore. Recommend
  declining it, with the reason.
- A third-party action names a page. Run `get_url_content` to see what it says
  about the brand now. It may already be fixed.
- Generated text can use an old brand name or wrong facts. Correct them in the
  pitch before anyone sends it.

## 3. Writes need the user's yes

`update_actions_status`, `update_action_steps`, `create_actions`,
`update_actions` and `delete_actions` change the shared plan. Show the user the
exact list of changes and wait for a yes before you call them. Never send an
email, post, or pitch yourself: an action records the work, it does not do it.

## 4. Log shipped work on the day it shipped

For work Peec did not suggest (a page launch, a rename, a crawler fix), use
`create_actions` with `status: "COMPLETED"`, `completed_at` set to the real
ship date, the `page_url` it changed, and the `prompt_ids` it was meant to
move. For a Peec action that was done earlier, use `update_actions_status` with
`completed_at`. The Impact view then marks that day on the chart.

## 5. Measure before and after

Two weeks or more after the ship date, compare `get_brand_report` and
`get_url_report` for the prompts and page the action named: the 14 days before
the date against the 14 days after. Say for each action: worked, no change yet,
or did not work. Recommend more of what worked.

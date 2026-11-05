---
name: diagnose-ai-visibility
description: Find out why AI search engines leave your brand out of an answer, and pick the one fix that matches the cause — read the answers and the sources they cite, map the question to your own page, then decide if the page is broken, missing, weak, or outweighed by third-party sources. Use when the user asks why ChatGPT, Gemini, Perplexity or Google AI Overviews do not mention them, which prompts they lose, what content to write next, or how to improve AI visibility.
argument-hint: a prompt, topic, or tag to diagnose (default: the lowest non-branded prompts)
allowed-tools: mcp__peec__list_projects, mcp__peec__list_brands, mcp__peec__list_topics, mcp__peec__list_tags, mcp__peec__list_prompts, mcp__peec__list_model_channels, mcp__peec__get_brand_report, mcp__peec__get_url_report, mcp__peec__get_domain_report, mcp__peec__get_links_report, mcp__peec__list_chats, mcp__peec__get_chat, mcp__peec__list_search_queries, mcp__peec__get_url_content, mcp__peec__get_url_content_diff, mcp__peec__get_agent_visits, mcp__peec__list_actions, mcp__peec__get_action, mcp__peec__list_facts, mcp__peec__get_project_profile
---

# Diagnose before you create

A lost prompt has one of four causes, and each cause has a different fix. A new
page is the right fix for only one of them. Find the cause first.

## 1. Pick the prompts to diagnose

Run `list_projects`, then `list_brands` to find the brand with `is_own: true`.
If the user named no prompt, run `get_brand_report` for the last 14 days,
broken down by prompt, and take the 10 non-branded prompts with the lowest
visibility. Skip branded prompts: they measure recognition, not demand.

## 2. Read what the engines actually answered

For each prompt, run `list_chats` for the same window and `get_chat` on two or
three of them, from different engines. Record:

- the brands the answer named, and their order
- the `sources` it retrieved and the `links` it wrote into its text
- the `queries` it searched: these are the words the engine uses for the topic

`list_search_queries` for the prompt shows the same searches across all chats.

## 3. Decide the cause, in this order

Stop at the first one that applies.

1. **Technical.** Find your page that answers this question. Check that it
   loads, is in the sitemap, and is not blocked in `robots.txt`.
   `get_agent_visits` grouped by `request_path` and `response_status` shows if
   AI crawlers reach it and what status they get (it needs connected access
   logs). A failure here is the cause.
2. **Missing.** No page of yours answers this question directly. A page that
   mentions the topic in passing does not count.
3. **Weak.** Your page exists and crawlers reach it, but it does not answer the
   question in its first screen, has no direct comparison or steps, or has
   facts that are out of date. `get_url_report` shows if engines retrieve it
   but do not cite it. Name the exact gap.
4. **Third-party.** Your page is fine, but the answer is built from other
   sites. Run `get_url_content` on the top cited sources to see what each one
   says about you: absent, wrong, out of date, or fair.

## 4. One action per prompt

- Technical: the exact fix and the URL.
- Missing: one new page, with the searches from step 2 as its headings.
- Weak: refresh the page. Say what to change. Never propose a new page when a
  weak page already exists for the same question.
- Third-party: for each source, say if you own it, can claim it (a listing or
  profile), must earn it (a review, list, or thread), or must contest it
  (wrong facts). Give the correction and your source URL.

Before you propose an action, run `list_actions` and reuse a Peec action that
already covers it. Do not create, accept, or decline actions here: hand off to
`work-peec-actions` when the user wants the plan tracked.

## Report

A table: prompt, visibility, cause, your page, the cited sources, the one
action. Then at most five next actions, ranked by expected effect. Say which
data you could not read instead of guessing.

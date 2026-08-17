import type { GithubTriggerEvent } from "@superset/shared/automation-triggers";

/**
 * The sentence a GitHub trigger reads as.
 *
 * Each event names its own words and its own slots, because the filters differ:
 * a comment has both a comment author and the author of the thing commented on,
 * a push has neither. Keeping the grammar as data means the row renders one way
 * and every event describes itself.
 */

export type Slot =
	| "repositories"
	| "branches"
	| "labels"
	| "actor"
	| "subjectAuthor"
	| "commentFilter";

export type SentencePart = { text: string } | { slot: Slot };

export const GITHUB_SENTENCES: Record<GithubTriggerEvent, SentencePart[]> = {
	draft_opened: [
		{ text: "Draft opened in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"pull_request.opened": [
		{ text: "PR opened in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"pull_request.pushed": [
		{ text: "PR pushed in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"pull_request.merged": [
		{ text: "PR merged in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	comment_added: [
		{ slot: "commentFilter" },
		{ text: "by" },
		{ slot: "actor" },
		{ text: "on a PR by" },
		{ slot: "subjectAuthor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	issue_comment: [
		{ slot: "commentFilter" },
		{ text: "by" },
		{ slot: "actor" },
		{ text: "on an issue by" },
		{ slot: "subjectAuthor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	push_to_branch: [
		{ text: "Push to" },
		{ slot: "branches" },
		{ text: "in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	label_change: [
		{ text: "Label" },
		{ slot: "labels" },
		{ text: "changed in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	checks_completed: [{ text: "Checks completed in" }, { slot: "repositories" }],
	pr_review_comment: [
		{ slot: "commentFilter" },
		{ text: "in a review by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.approved": [
		{ text: "PR approved by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.changes_requested": [
		{ text: "Changes requested by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.commented": [
		{ text: "Review commented by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.any": [
		{ text: "Any review submitted by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"review_thread.resolved": [
		{ text: "Review thread resolved in" },
		{ slot: "repositories" },
	],
	"review_thread.unresolved": [
		{ text: "Review thread unresolved in" },
		{ slot: "repositories" },
	],
	"review_thread.any": [
		{ text: "Any review thread event in" },
		{ slot: "repositories" },
	],
	"workflow_run.success": [
		{ text: "Workflow succeeded in" },
		{ slot: "repositories" },
	],
	"workflow_run.failure": [
		{ text: "Workflow failed in" },
		{ slot: "repositories" },
	],
	"workflow_run.cancelled": [
		{ text: "Workflow cancelled in" },
		{ slot: "repositories" },
	],
	"workflow_run.any": [
		{ text: "Any workflow conclusion in" },
		{ slot: "repositories" },
	],
};

/** The Add Trigger menu, grouped the way the events actually divide. */
export const GITHUB_MENU: Array<{
	label: string;
	children?: Array<{ label: string; event: GithubTriggerEvent }>;
	event?: GithubTriggerEvent;
}> = [
	{ label: "Draft opened", event: "draft_opened" },
	{
		label: "Pull request…",
		children: [
			{ label: "Opened", event: "pull_request.opened" },
			{ label: "Pushed", event: "pull_request.pushed" },
			{ label: "Merged", event: "pull_request.merged" },
		],
	},
	{ label: "Comment added", event: "comment_added" },
	{ label: "New push to branch", event: "push_to_branch" },
	{ label: "Label change", event: "label_change" },
	{ label: "Checks completed", event: "checks_completed" },
	{ label: "Issue comment", event: "issue_comment" },
	{ label: "PR review comment", event: "pr_review_comment" },
	{
		label: "PR review submitted…",
		children: [
			{ label: "Approved", event: "pr_review_submitted.approved" },
			{
				label: "Changes requested",
				event: "pr_review_submitted.changes_requested",
			},
			{ label: "Commented", event: "pr_review_submitted.commented" },
			{ label: "Any review", event: "pr_review_submitted.any" },
		],
	},
	{
		label: "Review thread…",
		children: [
			{ label: "Resolved", event: "review_thread.resolved" },
			{ label: "Unresolved", event: "review_thread.unresolved" },
			{ label: "Any thread event", event: "review_thread.any" },
		],
	},
	{
		label: "Workflow run completed…",
		children: [
			{ label: "Success", event: "workflow_run.success" },
			{ label: "Failure", event: "workflow_run.failure" },
			{ label: "Cancelled", event: "workflow_run.cancelled" },
			{ label: "Any conclusion", event: "workflow_run.any" },
		],
	},
];

/** Events whose sentence carries a second person and a body filter. */
const COMMENT_EVENTS = new Set<GithubTriggerEvent>([
	"comment_added",
	"issue_comment",
]);

/**
 * A new trigger of this event: the repository still to be chosen, every
 * optional filter wide open.
 */
export function createGithubConfig(event: GithubTriggerEvent) {
	const base = {
		kind: "github" as const,
		// Null matches nothing, which is the safety property for repositories: an
		// unfinished trigger must not fire on every repo, and the form refuses to
		// save until one is chosen.
		repositories: null,
		// Branches and labels are optional narrowings, so they start at "any" —
		// shown or not. Null here would render as "Any branch" while matching
		// nothing, and nothing validates them, so the trigger would look complete
		// and never fire.
		branches: { mode: "any" as const },
		labels: { mode: "any" as const },
		actor: "anyone" as const,
		includeForks: false as const,
	};

	// Branching rather than spreading conditionally: the config is a union, and
	// an optional field does not narrow it to the comment member.
	if (COMMENT_EVENTS.has(event)) {
		return {
			...base,
			event: event as "comment_added" | "issue_comment",
			subjectAuthor: "anyone" as const,
			commentFilter: null,
		};
	}
	return {
		...base,
		event: event as Exclude<
			GithubTriggerEvent,
			"comment_added" | "issue_comment"
		>,
	};
}

import { PR_STATE_INK_CLASS_NAME } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStateGlyph";
import {
	PR_GREEN_TEXT_CLASS_NAME,
	PR_RED_TEXT_CLASS_NAME,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-colors";
import type { GithubWorkItemLink } from "../githubWorkItem";

export type GithubWorkItemTone = "neutral" | "open" | "done" | "closed";

export type GithubWorkItemState = {
	state: "open" | "closed" | "merged";
	draft: boolean;
	stateReason: string | null;
};

export const GITHUB_WORK_ITEM_TONE_TEXT: Record<GithubWorkItemTone, string> = {
	neutral: "text-muted-foreground",
	open: PR_GREEN_TEXT_CLASS_NAME,
	done: PR_STATE_INK_CLASS_NAME.merged,
	closed: PR_RED_TEXT_CLASS_NAME,
};

/** The colour GitHub shows for a pull request or issue in this state. */
export function githubWorkItemTone(
	kind: GithubWorkItemLink["kind"],
	item: GithubWorkItemState | null,
): GithubWorkItemTone {
	if (!item) return "neutral";
	if (item.state === "merged") return "done";
	if (item.state === "closed") {
		if (kind === "pr") return "closed";
		return item.stateReason === "not_planned" ||
			item.stateReason === "duplicate"
			? "neutral"
			: "done";
	}
	return item.draft ? "neutral" : "open";
}

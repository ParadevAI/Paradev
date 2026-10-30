import type {
	ComposerChip,
	ComposerDraftSegment,
} from "@superset/chat-ui/PromptInput";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { getPluginIconUrl } from "renderer/components/PluginIcon";
import { PULL_REQUEST_ICON } from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";
import type { PullRequestDisplayState } from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState/toPullRequestDisplayState";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { iconDataUrl } from "../iconDataUrl";

export type LinkedContextChipData =
	| { kind: "linked_issue"; issue: LinkedIssue }
	| { kind: "linked_pr"; pr: LinkedPR };

export type LinkedContext = { issues: LinkedIssue[]; pr: LinkedPR | null };

export const LINKED_STATE_COLOR = {
	open: "#10b981",
	merged: "#a855f7",
	closed: "#ef4444",
	draft: "#a1a1aa",
} as const;

function prDisplayState(state: string): PullRequestDisplayState {
	return state === "draft" || state === "merged" || state === "closed"
		? state
		: "open";
}

export function linkedIssueIconUrl(
	issue: LinkedIssue,
	isDark: boolean,
): string | undefined {
	if (issue.source === "github") {
		return issue.state === "closed"
			? iconDataUrl(GoIssueClosed, LINKED_STATE_COLOR.merged)
			: iconDataUrl(GoIssueOpened, LINKED_STATE_COLOR.open);
	}
	return getPluginIconUrl(
		issue.source === "linear" ? "linear" : "superset",
		isDark,
	);
}

export function linkedPrIconUrl(pr: LinkedPR): string {
	const state = prDisplayState(pr.state);
	return iconDataUrl(PULL_REQUEST_ICON[state], LINKED_STATE_COLOR[state]);
}

export function linkedIssueChip(
	issue: LinkedIssue,
	isDark: boolean,
): ComposerChip {
	return {
		label: issue.slug,
		serialized: issue.url ?? `@${issue.slug}`,
		...(issue.title ? { description: issue.title } : {}),
		iconUrl: linkedIssueIconUrl(issue, isDark),
		data: { kind: "linked_issue", issue } satisfies LinkedContextChipData,
	};
}

export function linkedPrChip(pr: LinkedPR): ComposerChip {
	return {
		label: `#${pr.prNumber}`,
		serialized: pr.url,
		...(pr.title ? { description: pr.title } : {}),
		iconUrl: linkedPrIconUrl(pr),
		data: { kind: "linked_pr", pr } satisfies LinkedContextChipData,
	};
}

export function linkedContextData(data: unknown): LinkedContextChipData | null {
	const linked = data as
		| { kind?: unknown; issue?: LinkedIssue; pr?: LinkedPR }
		| undefined;
	if (linked?.kind === "linked_issue" && linked.issue)
		return { kind: "linked_issue", issue: linked.issue };
	if (linked?.kind === "linked_pr" && linked.pr)
		return { kind: "linked_pr", pr: linked.pr };
	return null;
}

export function linkedContextChip(
	data: LinkedContextChipData,
	isDark: boolean,
): ComposerChip {
	return data.kind === "linked_pr"
		? linkedPrChip(data.pr)
		: linkedIssueChip(data.issue, isDark);
}

export function linkedContextOf(chips: readonly ComposerChip[]): LinkedContext {
	const issues: LinkedIssue[] = [];
	let pr: LinkedPR | null = null;
	for (const chip of chips) {
		const data = linkedContextData(chip.data);
		if (!data) continue;
		if (data.kind === "linked_pr") {
			pr ??= data.pr;
		} else if (!issues.some((issue) => issue.slug === data.issue.slug)) {
			issues.push(data.issue);
		}
	}
	return { issues, pr };
}

export function draftLinkedContext(
	segments: readonly ComposerDraftSegment[],
): LinkedContext {
	return linkedContextOf(
		segments.flatMap((segment) =>
			segment.type === "chip" ? [segment.chip] : [],
		),
	);
}

export function linkedContextSeed(
	chips: readonly ComposerChip[],
): ComposerDraftSegment[] {
	return chips.flatMap((chip) => [
		{ type: "chip" as const, chip },
		{ type: "text" as const, text: " " },
	]);
}

const LINEAR_ISSUE_URL = /linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]*-\d+)/i;
const GITHUB_ISSUE_URL = /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/;
const GITHUB_PR_URL = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/;

export function linkedRefFromText(
	text: string,
):
	| { kind: "linear"; identifier: string }
	| { kind: "github-issue" | "github-pr"; number: number }
	| null {
	const linear = LINEAR_ISSUE_URL.exec(text);
	if (linear?.[1])
		return { kind: "linear", identifier: linear[1].toUpperCase() };
	const issue = GITHUB_ISSUE_URL.exec(text);
	if (issue?.[1]) return { kind: "github-issue", number: Number(issue[1]) };
	const pr = GITHUB_PR_URL.exec(text);
	if (pr?.[1]) return { kind: "github-pr", number: Number(pr[1]) };
	return null;
}

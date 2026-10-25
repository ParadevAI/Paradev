import type { LinkAction } from "renderer/lib/clickPolicy";
import { openPullRequestInBrowser } from "../openPullRequestInBrowser";
import { type PullRequestRef, pullRequestRefFromUrl } from "../pullRequestRef";

export type OpenPullRequestPane = (
	ref: PullRequestRef,
	placement?: "split" | "tab",
) => void;

export function openPullRequestLink(
	url: string,
	action: LinkAction | null,
	openPane: OpenPullRequestPane,
	openInBrowser: (url: string) => void = openPullRequestInBrowser,
): void {
	const ref = pullRequestRefFromUrl(url);
	if (!ref || action === "external") {
		openInBrowser(url);
		return;
	}
	openPane(ref, action === "newTab" ? "tab" : "split");
}

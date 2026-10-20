import { describe, expect, test } from "bun:test";

// #8472: a PR link that opens the pane or the browser directly ignores the
// click policy, so modifier-click can never reach GitHub again.
const RENDERER_ROOT = import.meta.dir.split("/").slice(0, -3).join("/");
const DASHBOARD = "routes/_authenticated/_dashboard";
const V2_WORKSPACE = `${DASHBOARD}/v2-workspace/$workspaceId`;
const SIDEBAR_ROWS = `${DASHBOARD}/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components`;

const SURFACES = [
	`${V2_WORKSPACE}/hooks/usePaneRegistry/components/DiffPane/components/DiffPaneHeaderExtras/components/DiffPanePRLink/DiffPanePRLink.tsx`,
	`${V2_WORKSPACE}/components/ChangesControl/components/PRStatusGroup/PRStatusGroup.tsx`,
	`${V2_WORKSPACE}/components/WorkspaceSidebar/hooks/useReviewTab/components/PRHeader/PRHeader.tsx`,
	`${SIDEBAR_ROWS}/DashboardSidebarExpandedWorkspaceRow/DashboardSidebarExpandedWorkspaceRow.tsx`,
	`${SIDEBAR_ROWS}/DashboardSidebarLegacyExpandedWorkspaceRow/DashboardSidebarLegacyExpandedWorkspaceRow.tsx`,
];

// The ↗ "View on GitHub" button is browser-only by design.
const BROWSER_ONLY_BUTTONS: Record<string, number> = {
	[SURFACES[0] as string]: 1,
};

const DIRECT_OPENERS = [
	/window\s*\.\s*open\s*\(/,
	/external\s*\.\s*openUrl\b/,
	/openPullRequestPaneInStore\s*\(/,
	/usePullRequestPaneIntent\s*\.\s*getState\s*\(\s*\)\s*\.\s*request\s*\(/,
	/onOpenPullRequest\s*\(/,
];

function withoutLinkCalls(source: string): string {
	const call = "openPullRequestLink(";
	let result = "";
	let index = 0;
	for (;;) {
		const start = source.indexOf(call, index);
		if (start === -1) return result + source.slice(index);
		result += source.slice(index, start);
		let depth = 0;
		let end = start + call.length - 1;
		for (; end < source.length; end++) {
			if (source[end] === "(") depth++;
			else if (source[end] === ")" && --depth === 0) break;
		}
		index = end + 1;
	}
}

describe("pull request links go through openPullRequestLink", () => {
	test.each(SURFACES)("%s", async (file) => {
		const source = await Bun.file(`${RENDERER_ROOT}/${file}`).text();
		const rest = withoutLinkCalls(source);
		const direct = DIRECT_OPENERS.filter((pattern) => pattern.test(rest)).map(
			String,
		);
		const browserOnly = rest.match(/openPullRequestInBrowser\s*\(/g) ?? [];
		expect({
			routed: source.includes("openPullRequestLink("),
			direct,
			browserOnly: browserOnly.length,
		}).toEqual({
			routed: true,
			direct: [],
			browserOnly: BROWSER_ONLY_BUTTONS[file] ?? 0,
		});
	});
});

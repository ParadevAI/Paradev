import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import { type LinkTierMap, tierFor } from "renderer/lib/clickPolicy";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../types";
import {
	runChatPullRequestLink,
	runUrlLinkAction,
	terminalUrlLinkAction,
} from "./runTerminalLinkAction";

const PR_URL = "https://github.com/superset-sh/superset/pull/8412";

function workspaceState(): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-1",
				layout: { type: "pane", paneId: "pane-1" },
				panes: {
					"pane-1": {
						id: "pane-1",
						kind: "diff",
						data: { path: "", collapsedFiles: [] } as PaneViewerData,
					},
				},
			},
		],
	};
}

function panesOfKind(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	kind: string,
) {
	return store
		.getState()
		.tabs.flatMap((tab) => Object.values(tab.panes))
		.filter((pane) => pane.kind === kind);
}

describe("runUrlLinkAction", () => {
	it("opens a GitHub pull request URL in the pull-request pane", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		runUrlLinkAction({ store }, PR_URL, "pane");

		expect(panesOfKind(store, "browser")).toHaveLength(0);
		expect(panesOfKind(store, "pull-request").map((pane) => pane.data)).toEqual(
			[{ repoFullName: "superset-sh/superset", number: 8412 }],
		);
	});

	it("opens the pull request in the right pane whenever one exists", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});
		const rightStore = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});
		let revealed = false;

		runUrlLinkAction(
			{
				store,
				rightPane: { store: rightStore, reveal: () => (revealed = true) },
			},
			PR_URL,
			"pane",
		);

		expect(revealed).toBe(true);
		expect(panesOfKind(store, "pull-request")).toHaveLength(0);
		expect(panesOfKind(rightStore, "browser")).toHaveLength(0);
		expect(panesOfKind(rightStore, "pull-request")).toHaveLength(1);
	});

	it("gives a new tab to a PR opened with the new-tab action", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		runUrlLinkAction({ store }, PR_URL, "newTab");

		const tabs = store.getState().tabs;
		expect(tabs).toHaveLength(2);
		expect(Object.values(tabs[1]?.panes ?? {})[0]?.kind).toBe("pull-request");
	});

	it("keeps PR comment, file and commit links in the browser", () => {
		for (const url of [
			`${PR_URL}#discussion_r123`,
			`${PR_URL}/files`,
			`${PR_URL}/commits/abc123`,
			"https://github.com/a/b?next=/pull/123",
		]) {
			const store = createWorkspaceStore<PaneViewerData>({
				initialState: workspaceState(),
			});

			runUrlLinkAction({ store }, url, "pane");

			expect(panesOfKind(store, "pull-request")).toHaveLength(0);
			expect(panesOfKind(store, "browser")).toHaveLength(1);
			expect(
				terminalUrlLinkAction(
					{ metaKey: false, ctrlKey: false, shiftKey: false },
					url,
					() => null,
				),
			).toBeNull();
		}
	});

	it("still opens other GitHub URLs in a browser pane", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		runUrlLinkAction(
			{ store },
			"https://github.com/superset-sh/superset/issues/1",
			"pane",
		);

		expect(panesOfKind(store, "pull-request")).toHaveLength(0);
		expect(panesOfKind(store, "browser")).toHaveLength(1);
	});
});

describe("runChatPullRequestLink", () => {
	const click = { metaKey: false, ctrlKey: false, shiftKey: false };

	it("opens the PR pane for a badge whose URL names a file or a comment", () => {
		for (const url of [
			PR_URL,
			`${PR_URL}/files?diff=split`,
			`${PR_URL}#discussion_r123`,
			"https://www.github.com/superset-sh/superset/pull/8412",
		]) {
			const store = createWorkspaceStore<PaneViewerData>({
				initialState: workspaceState(),
			});

			expect(runChatPullRequestLink({ store }, url, click)).toBe(true);

			expect(panesOfKind(store, "browser")).toHaveLength(0);
			expect(
				panesOfKind(store, "pull-request").map((pane) => pane.data),
			).toEqual([{ repoFullName: "superset-sh/superset", number: 8412 }]);
		}
	});

	it("sends a cmd-click to GitHub and leaves other URLs to the link settings", () => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: workspaceState(),
		});

		expect(
			runChatPullRequestLink({ store }, PR_URL, { ...click, metaKey: true }),
		).toBe(true);
		expect(panesOfKind(store, "pull-request")).toHaveLength(0);
		expect(panesOfKind(store, "browser")).toHaveLength(0);

		expect(
			runChatPullRequestLink(
				{ store },
				"https://github.com/superset-sh/superset/issues/1",
				click,
			),
		).toBe(false);
	});
});

describe("terminalUrlLinkAction", () => {
	const click = { metaKey: false, ctrlKey: false, shiftKey: false };
	const FILES_URL = `${PR_URL}/files`;
	const unbound = () => null;
	const external = () => "external" as const;
	const DEFAULT_URL_LINKS: LinkTierMap = {
		plain: null,
		shift: "newTab",
		meta: "pane",
		metaShift: "external",
	};
	const defaultMap = (event: typeof click) =>
		DEFAULT_URL_LINKS[tierFor(event, "4-tier")];

	it("opens the PR pane on a plain click the user left unbound", () => {
		expect(terminalUrlLinkAction(click, PR_URL, unbound)).toBe("pane");
		expect(terminalUrlLinkAction(click, PR_URL, defaultMap)).toBe("pane");
	});

	it("opens the system browser on shift-click whatever the map says", () => {
		const shift = { ...click, shiftKey: true };
		expect(terminalUrlLinkAction(shift, PR_URL, defaultMap)).toBe("external");
		expect(terminalUrlLinkAction(shift, PR_URL, unbound)).toBe("external");
	});

	it("follows a bound plain click for a bare PR URL", () => {
		expect(terminalUrlLinkAction(click, PR_URL, external)).toBe("external");
	});

	it("leaves cmd-clicks and non-bare URLs to the URL link settings", () => {
		const meta = { ...click, metaKey: true };
		const ctrl = { ...click, ctrlKey: true };
		expect(terminalUrlLinkAction(meta, PR_URL, unbound)).toBeNull();
		expect(terminalUrlLinkAction(ctrl, PR_URL, unbound)).toBeNull();
		expect(terminalUrlLinkAction(meta, PR_URL, defaultMap)).toBe("pane");
		expect(terminalUrlLinkAction(ctrl, PR_URL, defaultMap)).toBe("pane");
		expect(terminalUrlLinkAction(click, FILES_URL, unbound)).toBeNull();
		expect(terminalUrlLinkAction(click, FILES_URL, external)).toBe("external");
	});
});

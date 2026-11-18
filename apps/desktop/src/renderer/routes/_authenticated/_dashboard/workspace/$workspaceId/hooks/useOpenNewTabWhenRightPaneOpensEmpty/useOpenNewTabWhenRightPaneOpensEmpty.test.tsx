import { afterEach, describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useOpenNewTabWhenRightPaneOpensEmpty } = await import(
	"./useOpenNewTabWhenRightPaneOpensEmpty"
);

afterEach(cleanup);

const kinds = (
	store: ReturnType<typeof createWorkspaceStore<PaneViewerData>>,
) =>
	store
		.getState()
		.tabs.flatMap((tab) => Object.values(tab.panes).map((pane) => pane.kind));

describe("useOpenNewTabWhenRightPaneOpensEmpty", () => {
	test("opening an empty pane adds one New Tab; emptying an open pane does not", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		const props = { store, isOpen: false, enabled: false };
		const hook = renderHook(
			(current: typeof props) => useOpenNewTabWhenRightPaneOpensEmpty(current),
			{ initialProps: props },
		);

		hook.rerender({ ...props, isOpen: true });
		expect(kinds(store)).toEqual([]);

		hook.rerender({ ...props, isOpen: true, enabled: true });
		expect(kinds(store)).toEqual(["new-tab"]);

		act(() => store.getState().removeTab(store.getState().tabs[0]?.id ?? ""));
		hook.rerender({ ...props, isOpen: true, enabled: true });
		expect(kinds(store)).toEqual([]);

		hook.rerender({ ...props, isOpen: false, enabled: true });
		hook.rerender({ ...props, isOpen: true, enabled: true });
		expect(kinds(store)).toEqual(["new-tab"]);
	});

	test("an open with a tab already placed adds nothing", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		store.getState().addTab({
			panes: [{ kind: "files", data: { kind: "files" } }],
		});
		renderHook(() =>
			useOpenNewTabWhenRightPaneOpensEmpty({
				store,
				isOpen: true,
				enabled: true,
			}),
		);
		expect(kinds(store)).toEqual(["files"]);
	});
});

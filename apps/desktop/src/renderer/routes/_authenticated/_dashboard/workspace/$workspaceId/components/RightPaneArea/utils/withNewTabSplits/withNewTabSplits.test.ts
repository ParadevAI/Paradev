import { describe, expect, mock, test } from "bun:test";
import type { RendererContext } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { NEW_TAB_PANE } from "../../../RightPaneNewTab";
import { withNewTabSplitButton, withNewTabSplitMenu } from "./withNewTabSplits";

function contextWithSplit(parentDirection: "horizontal" | null) {
	const split = mock();
	const ctx = {
		pane: { parentDirection },
		actions: { split },
	} as unknown as RendererContext<PaneViewerData>;
	return { ctx, split };
}

describe("withNewTabSplits", () => {
	test("splits open a new-tab pane and other actions are kept", () => {
		const terminalSplit = mock();
		const keep = { key: "close", onSelect: mock() };
		const menu = withNewTabSplitMenu([
			{ key: "split-horizontal", onSelect: terminalSplit },
			{ key: "split-vertical", onSelect: terminalSplit },
			keep,
		]);
		const { ctx, split } = contextWithSplit(null);
		menu[0]?.onSelect?.(ctx);
		menu[1]?.onSelect?.(ctx);
		expect(split.mock.calls).toEqual([
			["down", NEW_TAB_PANE],
			["right", NEW_TAB_PANE],
		]);
		expect(menu[2]).toBe(keep);

		const [button] = withNewTabSplitButton([
			{ key: "split", icon: null, onClick: terminalSplit },
		]);
		const stacked = contextWithSplit("horizontal");
		button?.onClick(stacked.ctx);
		expect(stacked.split.mock.calls).toEqual([["down", NEW_TAB_PANE]]);
		expect(terminalSplit).not.toHaveBeenCalled();
	});
});

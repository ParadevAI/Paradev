import { describe, expect, test } from "bun:test";
import {
	emptyWorkspaceView,
	withRightPaneFullScreenToggled,
	withRightPaneVisibility,
} from "./workspaceView";

const closed = emptyWorkspaceView("ws");
const open = withRightPaneVisibility(closed, { open: true });

describe("right pane visibility", () => {
	test("full screen entered from closed closes again when left", () => {
		const full = withRightPaneFullScreenToggled(closed);
		expect(full.rightPane.visibility).toBe("fullScreen");
		expect(withRightPaneFullScreenToggled(full).rightPane.visibility).toBe(
			"closed",
		);
	});

	test("full screen entered from open goes back to open", () => {
		const full = withRightPaneFullScreenToggled(open);
		expect(withRightPaneFullScreenToggled(full).rightPane.visibility).toBe(
			"open",
		);
	});

	test("opening an already full screen pane keeps it full screen", () => {
		const full = withRightPaneFullScreenToggled(open);
		expect(
			withRightPaneVisibility(full, { open: true }).rightPane.visibility,
		).toBe("fullScreen");
	});

	test("closing clears where full screen would go back to", () => {
		const full = withRightPaneFullScreenToggled(closed);
		expect(withRightPaneVisibility(full, { open: false }).rightPane).toEqual(
			closed.rightPane,
		);
	});
});

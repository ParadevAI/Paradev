import { expect, test } from "bun:test";
import { topRightPaneId } from "./usePaneAside";

test("the aside goes to the pane at the top-right of the layout", () => {
	expect(topRightPaneId({ type: "pane", paneId: "a" })).toBe("a");
	expect(
		topRightPaneId({
			type: "split",
			direction: "horizontal",
			first: { type: "pane", paneId: "left" },
			second: {
				type: "split",
				direction: "vertical",
				first: { type: "pane", paneId: "top-right" },
				second: { type: "pane", paneId: "bottom-right" },
			},
		}),
	).toBe("top-right");
	expect(topRightPaneId(null)).toBeNull();
});

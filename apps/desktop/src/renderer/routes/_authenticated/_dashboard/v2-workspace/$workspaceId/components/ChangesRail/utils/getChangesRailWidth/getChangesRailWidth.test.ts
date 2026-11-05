import { describe, expect, it } from "bun:test";
import {
	MAX_CHANGES_RAIL_WIDTH,
	MIN_AGENT_AREA_WIDTH,
	MIN_CHANGES_RAIL_WIDTH,
} from "../../constants";
import { getChangesRailWidth } from "./getChangesRailWidth";

const shown = {
	enabled: true,
	changedFileCount: 3,
	containerWidth: 1600,
	preferredWidth: 280,
};

describe("getChangesRailWidth", () => {
	it("shows at the preferred width when the workspace has changes and room", () => {
		expect(getChangesRailWidth(shown)).toEqual({
			width: 280,
			maxWidth: MAX_CHANGES_RAIL_WIDTH,
		});
	});

	it("stays hidden when the user turned it off", () => {
		expect(getChangesRailWidth({ ...shown, enabled: false })).toBeNull();
	});

	it("stays hidden while nothing has changed", () => {
		expect(getChangesRailWidth({ ...shown, changedFileCount: 0 })).toBeNull();
	});

	it("stays hidden until the area is measured", () => {
		expect(getChangesRailWidth({ ...shown, containerWidth: null })).toBeNull();
	});

	it("narrows to keep the agent area readable, then gives way", () => {
		const tight = MIN_AGENT_AREA_WIDTH + 250;
		expect(
			getChangesRailWidth({
				...shown,
				containerWidth: tight,
				preferredWidth: MAX_CHANGES_RAIL_WIDTH,
			}),
		).toEqual({ width: 250, maxWidth: 250 });
		expect(
			getChangesRailWidth({
				...shown,
				containerWidth: MIN_AGENT_AREA_WIDTH + MIN_CHANGES_RAIL_WIDTH - 1,
			}),
		).toBeNull();
	});
});

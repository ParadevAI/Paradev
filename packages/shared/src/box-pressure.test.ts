import { describe, expect, test } from "bun:test";
import {
	type BoxPressure,
	parseBoxPressure,
	parseBoxPressureMessage,
} from "./box-pressure";

const busy: BoxPressure = {
	level: "busy",
	limitedBy: ["cpu"],
	reap: null,
	at: 1,
};

describe("parseBoxPressure", () => {
	test("accepts a report and drops duplicate resources", () => {
		expect(
			parseBoxPressure({ ...busy, limitedBy: ["cpu", "cpu", "memory"] }),
		).toEqual({ ...busy, limitedBy: ["cpu", "memory"] });
	});

	test("rejects an unknown level, an unknown resource or a bad reap", () => {
		expect(parseBoxPressure({ ...busy, level: "ok" })).toBeNull();
		expect(parseBoxPressure({ ...busy, limitedBy: ["disk"] })).toBeNull();
		expect(
			parseBoxPressure({
				...busy,
				reap: { processName: "tsc", rssMb: -1, at: 1 },
			}),
		).toBeNull();
	});
});

test("parseBoxPressureMessage keeps clears and drops malformed entries", () => {
	const message = parseBoxPressureMessage(
		JSON.stringify({
			type: "box-pressure",
			snapshot: false,
			workspaces: { a: busy, b: null, c: { level: "nope" } },
		}),
	);
	expect(message).toEqual({
		type: "box-pressure",
		snapshot: false,
		workspaces: { a: busy, b: null },
	});
	expect(parseBoxPressureMessage(JSON.stringify({ type: "nudge" }))).toBeNull();
});

import { describe, expect, test } from "bun:test";
import {
	INITIAL_PAGE_FIND_STATE,
	type PageFindAction,
	type PageFindState,
	pageFindReducer,
} from "./pageFindState";

function run(...actions: PageFindAction[]): PageFindState {
	return actions.reduce(pageFindReducer, INITIAL_PAGE_FIND_STATE);
}

const READY: PageFindAction = { type: "frame-ready", features: ["find"] };

describe("pageFindReducer", () => {
	test("a repeat open keeps the bar open and asks for focus again", () => {
		const once = run({ type: "open" });
		const twice = pageFindReducer(once, { type: "open" });
		expect(twice.open).toBe(true);
		expect(twice.focusRequest).toBe(once.focusRequest + 1);
	});

	test("takes only the result for the current query", () => {
		const state = run(
			READY,
			{ type: "open" },
			{ type: "query", query: "cat" },
			{
				type: "result",
				result: { query: "ca", total: 9, index: 0, capped: false },
			},
		);
		expect(state.result).toBeNull();

		const answered = pageFindReducer(state, {
			type: "result",
			result: { query: "cat", total: 3, index: 1, capped: false },
		});
		expect(answered.result).toEqual({ total: 3, index: 1, capped: false });
	});

	test("a new query and closing both drop the old count", () => {
		const answered = run(
			READY,
			{ type: "open" },
			{ type: "query", query: "cat" },
			{
				type: "result",
				result: { query: "cat", total: 3, index: 0, capped: false },
			},
		);
		expect(
			pageFindReducer(answered, { type: "query", query: "ca" }).result,
		).toBeNull();
		const closed = pageFindReducer(answered, { type: "close" });
		expect(closed).toMatchObject({ open: false, query: "cat", result: null });
		expect(
			pageFindReducer(closed, {
				type: "result",
				result: { query: "cat", total: 3, index: 0, capped: false },
			}).result,
		).toBeNull();
	});

	test("a frame served before find disables the bar at once", () => {
		const state = run(
			{ type: "open" },
			{ type: "frame-ready", features: undefined },
		);
		expect(state.availability).toBe("unavailable");
		expect(state.frameEpoch).toBe(0);
	});

	test("a frame that never answers disables the bar, and a late one revives it", () => {
		const silent = run({ type: "open" }, { type: "no-answer" });
		expect(silent.availability).toBe("unavailable");

		const revived = pageFindReducer(silent, READY);
		expect(revived.availability).toBe("available");
		expect(pageFindReducer(revived, { type: "no-answer" }).availability).toBe(
			"available",
		);
	});

	test("every ready from a frame that can find asks for a fresh search", () => {
		const first = run(READY);
		const reloaded = pageFindReducer(first, READY);
		expect(reloaded.frameEpoch).toBe(first.frameEpoch + 1);
	});
});

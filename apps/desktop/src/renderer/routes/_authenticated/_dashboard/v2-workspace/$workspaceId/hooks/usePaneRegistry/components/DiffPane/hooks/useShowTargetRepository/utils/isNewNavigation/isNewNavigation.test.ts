import { expect, test } from "bun:test";
import { isNewNavigation } from "./isNewNavigation";

const sessionStartedAt = 1000;

test("a tick from this session that the pane has not handled is new", () => {
	expect(
		isNewNavigation({
			tick: 1500,
			lastHandledTick: undefined,
			sessionStartedAt,
		}),
	).toBe(true);
	expect(
		isNewNavigation({ tick: 1600, lastHandledTick: 1500, sessionStartedAt }),
	).toBe(true);
});

test("a remounted pane skips the tick it handled", () => {
	expect(
		isNewNavigation({ tick: 1500, lastHandledTick: 1500, sessionStartedAt }),
	).toBe(false);
});

test("a pane restored from an earlier session is not a navigation", () => {
	expect(
		isNewNavigation({
			tick: 500,
			lastHandledTick: undefined,
			sessionStartedAt,
		}),
	).toBe(false);
});

test("no tick is not a navigation", () => {
	expect(
		isNewNavigation({
			tick: undefined,
			lastHandledTick: undefined,
			sessionStartedAt,
		}),
	).toBe(false);
});

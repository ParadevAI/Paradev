import { beforeEach, describe, expect, test } from "bun:test";
import { backfillCompletedAt, useStarNagStore } from "./store";

function resetStore() {
	useStarNagStore.setState({
		completed: false,
		completedAt: null,
		deferredUntil: null,
	});
}

describe("useStarNagStore", () => {
	beforeEach(() => {
		resetStore();
	});

	test("isEligible() is true with no completion and no active cooldown", () => {
		expect(useStarNagStore.getState().isEligible()).toBe(true);
	});

	test("snooze() starts a cooldown", () => {
		useStarNagStore.getState().snooze();

		const state = useStarNagStore.getState();
		expect(state.deferredUntil).toBeGreaterThan(Date.now());
		expect(state.isEligible()).toBe(false);
	});

	test("is eligible again once the cooldown expires", () => {
		useStarNagStore.setState({ deferredUntil: Date.now() - 1 });
		expect(useStarNagStore.getState().isEligible()).toBe(true);
	});

	test("markCompleted() mutes every surface and stamps completedAt", () => {
		useStarNagStore.getState().markCompleted();

		const state = useStarNagStore.getState();
		expect(state.isEligible()).toBe(false);
		expect(state.completed).toBe(true);
		expect(state.completedAt).toBeGreaterThan(0);
		expect(state.deferredUntil).toBeNull();
	});

	test("markUnstarred() clears completion but starts a cooldown instead of reopening immediately", () => {
		useStarNagStore.getState().markCompleted();
		useStarNagStore.getState().markUnstarred();

		const state = useStarNagStore.getState();
		expect(state.completed).toBe(false);
		expect(state.completedAt).toBeNull();
		expect(state.deferredUntil).toBeGreaterThan(Date.now());
		expect(state.isEligible()).toBe(false);
	});
});

describe("backfillCompletedAt", () => {
	test("stamps completedAt for a pre-timestamp-schema profile (completed true, completedAt null)", () => {
		const now = 1_000_000;
		expect(
			backfillCompletedAt({ completed: true, completedAt: null }, now),
		).toEqual({ completed: true, completedAt: now });
	});

	test("leaves an already-timestamped profile untouched", () => {
		const result = backfillCompletedAt(
			{ completed: true, completedAt: 42 },
			1_000_000,
		);
		expect(result.completedAt).toBe(42);
	});

	test("leaves a never-completed profile's null completedAt alone", () => {
		const result = backfillCompletedAt(
			{ completed: false, completedAt: null },
			1_000_000,
		);
		expect(result.completedAt).toBeNull();
	});
});

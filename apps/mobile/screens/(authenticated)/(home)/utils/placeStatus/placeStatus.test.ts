import { describe, expect, test } from "bun:test";
import {
	isPlaceUnreachable,
	placeEmptyState,
	placeStatus,
} from "./placeStatus";

describe("placeStatus", () => {
	test("pending presence is never offline", () => {
		expect(placeStatus(false, "pending")).toBe("pending");
		expect(isPlaceUnreachable("pending")).toBe(false);
	});

	test("failed presence can't check, answered presence is offline", () => {
		expect(placeStatus(false, "unavailable")).toBe("unknown");
		expect(placeStatus(false, "ready")).toBe("offline");
		expect(isPlaceUnreachable("unknown")).toBe(true);
	});
});

describe("placeEmptyState", () => {
	const answered = { isReady: true, failed: false };

	test("loads while presence is pending, even with no rows", () => {
		expect(placeEmptyState("pending", answered)).toBe("loading");
	});

	test("an online host whose list failed could not be reached, not empty", () => {
		expect(placeEmptyState("online", { isReady: true, failed: true })).toBe(
			"failed",
		);
		expect(placeEmptyState("online", answered)).toBe("empty");
		expect(placeEmptyState("online", { isReady: false, failed: false })).toBe(
			"loading",
		);
	});

	test("an unreachable host has nothing saved", () => {
		expect(placeEmptyState("offline", answered)).toBe("nothingSaved");
	});
});

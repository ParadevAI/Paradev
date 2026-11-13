import { describe, expect, test } from "bun:test";
import { pageUpdateAction } from "./pageUpdateAction";

describe("pageUpdateAction", () => {
	test("swaps straight to a version the viewer published", () => {
		expect(
			pageUpdateAction({
				shownVersion: 1,
				nextVersion: 2,
				publishedBy: "me",
				viewerId: "me",
			}),
		).toBe("swap");
	});

	test("offers a version someone else published", () => {
		expect(
			pageUpdateAction({
				shownVersion: 1,
				nextVersion: 2,
				publishedBy: "ana",
				viewerId: "me",
			}),
		).toBe("offer");
	});

	test("offers to a guest, who has no id to match", () => {
		expect(
			pageUpdateAction({
				shownVersion: 1,
				nextVersion: 2,
				publishedBy: null,
				viewerId: undefined,
			}),
		).toBe("offer");
	});

	test("never swaps for a viewer with no id, even when the publisher is unknown too", () => {
		expect(
			pageUpdateAction({
				shownVersion: 1,
				nextVersion: 2,
				publishedBy: undefined,
				viewerId: undefined,
			}),
		).toBe("offer");
	});

	test("does nothing when the served version did not change", () => {
		expect(
			pageUpdateAction({
				shownVersion: 2,
				nextVersion: 2,
				publishedBy: "me",
				viewerId: "me",
			}),
		).toBe("none");
	});
});

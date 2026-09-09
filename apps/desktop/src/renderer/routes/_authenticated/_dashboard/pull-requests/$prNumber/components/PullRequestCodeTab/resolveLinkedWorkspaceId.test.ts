import { describe, expect, test } from "bun:test";
import { resolveLinkedWorkspaceId } from "./resolveLinkedWorkspaceId";

describe("resolveLinkedWorkspaceId", () => {
	test("has nothing to resolve before the link answers", () => {
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: undefined,
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: null,
				liveWorkspaceIds: new Set(["ws-1"]),
			}),
		).toBeNull();
	});

	test("keeps an id the mirror still lists", () => {
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: "ws-1",
				liveWorkspaceIds: new Set(["ws-1", "ws-2"]),
			}),
		).toBe("ws-1");
	});

	test("drops an archived id: the mirror settled without it", () => {
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: "ws-1",
				liveWorkspaceIds: new Set(["ws-2"]),
			}),
		).toBeNull();
	});

	test("keeps the id while the mirror is still settling", () => {
		// Dropping it here would create the second PR checkout the seeded id
		// exists to prevent.
		expect(
			resolveLinkedWorkspaceId({
				workspaceId: "ws-1",
				liveWorkspaceIds: null,
			}),
		).toBe("ws-1");
	});
});

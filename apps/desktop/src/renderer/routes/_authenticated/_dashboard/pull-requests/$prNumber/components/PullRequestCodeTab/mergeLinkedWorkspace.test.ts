import { describe, expect, test } from "bun:test";
import { mergeLinkedWorkspace } from "./mergeLinkedWorkspace";

describe("mergeLinkedWorkspace", () => {
	test("takes the host's link when it has one", () => {
		expect(mergeLinkedWorkspace(undefined, { workspaceId: "ws-1" })).toEqual({
			workspaceId: "ws-1",
		});
	});

	test("keeps a seeded id when the host has not linked it yet", () => {
		// The refetch after the 30s staleness window is where the seed used to
		// die: the host answers null, the next send creates a second checkout.
		expect(
			mergeLinkedWorkspace(
				{ workspaceId: "ws-1", seeded: true },
				{ workspaceId: null },
			),
		).toEqual({ workspaceId: "ws-1", seeded: true });
	});

	test("lets the host's own link replace a seeded id", () => {
		expect(
			mergeLinkedWorkspace(
				{ workspaceId: "ws-1", seeded: true },
				{ workspaceId: "ws-2" },
			),
		).toEqual({ workspaceId: "ws-2" });
	});

	test("does not resurrect an id the host itself had answered", () => {
		expect(
			mergeLinkedWorkspace({ workspaceId: "ws-1" }, { workspaceId: null }),
		).toEqual({ workspaceId: null });
	});

	test("carries nothing forward from an empty seed", () => {
		expect(
			mergeLinkedWorkspace(
				{ workspaceId: null, seeded: true },
				{ workspaceId: null },
			),
		).toEqual({ workspaceId: null });
	});
});

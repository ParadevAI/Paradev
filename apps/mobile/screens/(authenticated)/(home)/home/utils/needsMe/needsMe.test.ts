import { describe, expect, test } from "bun:test";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	buildNeedsMeList,
	cloudRowAttention,
	countAttention,
	type NeedsMeCandidate,
	needsMeCount,
} from "./needsMe";

const candidate = (
	id: string,
	attention: NeedsMeCandidate["attention"],
	ts = 0,
): NeedsMeCandidate => ({
	item: {
		kind: "workspace",
		workspace: { id } as HostWorkspaceItem,
		detail: "demo · Alpha",
	},
	attention,
	ts,
});

const labels = {
	input: "Needs input",
	review: "Ready for review",
	working: "Working",
};

describe("needsMe", () => {
	test("groups needs input (with failures), then review, then working, newest first", () => {
		const list = buildNeedsMeList(
			[
				candidate("working", "working"),
				candidate("review", "review"),
				candidate("old-input", "permission", 1),
				candidate("failed", "failed", 2),
				candidate("idle", null),
			],
			labels,
		);
		expect(
			list.map((item) =>
				item.kind === "periodHeader"
					? item.label
					: item.kind === "workspace"
						? item.workspace.id
						: item.kind,
			),
		).toEqual([
			"Needs input",
			"failed",
			"old-input",
			"Ready for review",
			"review",
			"Working",
			"working",
		]);
	});

	test("counts needs input and review but not working", () => {
		const counts = countAttention([
			"permission",
			"failed",
			"review",
			"working",
			null,
		]);
		expect(counts).toEqual({ input: 2, review: 1, working: 1 });
		expect(needsMeCount(counts)).toBe(3);
	});
});

describe("cloudRowAttention", () => {
	test("reads review only while unread", () => {
		const row = {
			status: "running",
			agentStatus: "review",
			agentStatusAt: new Date(100),
		};
		expect(cloudRowAttention(row, undefined, false)).toBe("review");
		expect(cloudRowAttention(row, 100, false)).toBeNull();
	});
});

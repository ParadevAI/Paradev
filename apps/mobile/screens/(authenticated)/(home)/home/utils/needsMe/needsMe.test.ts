import { describe, expect, test } from "bun:test";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	buildNeedsMeList,
	cloudRowAttention,
	countAttention,
	hostRowAttention,
	isCloudRowUnread,
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
				item.kind === "sectionLabel"
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

	test("marks its rows as under a label that names their state", () => {
		const [, row] = buildNeedsMeList([candidate("a", "permission")], labels);
		expect(row).toMatchObject({ kind: "workspace", stateInLabel: true });
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

describe("hostRowAttention", () => {
	test("prefers the sessions' state, else reads a manual mark as review", () => {
		const live = new Map([["a", "working" as const]]);
		expect(hostRowAttention("a", live, { a: true })).toBe("working");
		expect(hostRowAttention("b", live, { b: true })).toBe("review");
		expect(hostRowAttention("c", live, {})).toBeNull();
	});
});

describe("isCloudRowUnread", () => {
	test("is unread when marked, or a review landed after the last read", () => {
		const row = { agentStatus: "review", agentStatusAt: new Date(100) };
		expect(isCloudRowUnread(row, 50, false)).toBe(true);
		expect(isCloudRowUnread(row, 100, false)).toBe(false);
		expect(isCloudRowUnread({ ...row, agentStatus: "idle" }, 0, true)).toBe(
			true,
		);
	});
});

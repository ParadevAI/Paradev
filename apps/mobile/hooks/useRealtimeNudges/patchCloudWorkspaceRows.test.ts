import { describe, expect, test } from "bun:test";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { patchCloudWorkspaceRows } from "./patchCloudWorkspaceRows";

const row = (id: string) =>
	({
		id,
		agentStatus: null,
		agentStatusAt: null,
	}) as unknown as CloudWorkspaceRow;

describe("patchCloudWorkspaceRows", () => {
	test("applies agent status to the named row only", () => {
		const [a, b] = patchCloudWorkspaceRows(
			[row("a"), row("b")],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					agentStatus: "working",
					agentStatusAt: 1_000,
				},
			],
		);
		expect(a?.agentStatus).toBe("working");
		expect(a?.agentStatusAt).toEqual(new Date(1_000));
		expect(b?.agentStatus).toBeNull();
	});

	test("clears agent status when the patch says null", () => {
		const [a] = patchCloudWorkspaceRows(
			[{ ...row("a"), agentStatus: "working" } as CloudWorkspaceRow],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					agentStatus: null,
					agentStatusAt: 2_000,
				},
			],
		);
		expect(a?.agentStatus).toBeNull();
	});

	test("ignores a status older than the cached one", () => {
		const [a] = patchCloudWorkspaceRows(
			[
				{
					...row("a"),
					agentStatus: "review",
					agentStatusAt: new Date(5_000).toISOString(),
				} as unknown as CloudWorkspaceRow,
			],
			[
				{
					kind: "cloud_workspaces",
					workspaceId: "a",
					agentStatus: "working",
					agentStatusAt: 4_000,
				},
			],
		);
		expect(a?.agentStatus).toBe("review");
	});
});

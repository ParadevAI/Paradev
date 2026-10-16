import { describe, expect, test } from "bun:test";
import { deriveFinishedWorkspaces } from "./deriveFinishedWorkspaces";

const binding = (
	workspaceId: string,
	terminalId: string,
	lastEventType: string,
	lastEventAt: number,
) => ({
	workspaceId,
	terminalId,
	agentId: "claude",
	lastEventType,
	lastEventAt,
});

const cloud = (
	id: string,
	agentStatus: string | null,
	at: number | null,
	extra: { inSidebar?: boolean; lastReadAt?: number } = {},
) => ({
	id,
	agentStatus,
	agentStatusAt: at === null ? null : new Date(at),
	inSidebar: extra.inSidebar ?? true,
	lastReadAt: extra.lastReadAt,
});

describe("workspaces whose agent finished", () => {
	test("one row per workspace, for the terminal that stopped last", () => {
		expect(
			deriveFinishedWorkspaces({
				bindings: [
					binding("w1", "t1", "Stop", 100),
					binding("w1", "t2", "Stop", 300),
					binding("w2", "t3", "Stop", 200),
				],
				terminalSeenAt: {},
				cloud: [],
			}),
		).toEqual([
			{
				workspaceId: "w1",
				location: "local",
				terminalId: "t2",
				agentId: "claude",
				finishedAt: 300,
				terminals: [
					{ terminalId: "t2", at: 300 },
					{ terminalId: "t1", at: 100 },
				],
			},
			{
				workspaceId: "w2",
				location: "local",
				terminalId: "t3",
				agentId: "claude",
				finishedAt: 200,
				terminals: [{ terminalId: "t3", at: 200 }],
			},
		]);
	});

	test("it clears once the workspace was opened after the agent stopped", () => {
		expect(
			deriveFinishedWorkspaces({
				bindings: [binding("w1", "t1", "Stop", 100)],
				terminalSeenAt: { t1: 150 },
				cloud: [],
			}),
		).toEqual([]);
	});

	test("it clears when the agent starts another turn, and comes back when that turn ends", () => {
		const working = deriveFinishedWorkspaces({
			bindings: [binding("w1", "t1", "Start", 200)],
			terminalSeenAt: {},
			cloud: [],
		});
		expect(working).toEqual([]);
		const again = deriveFinishedWorkspaces({
			bindings: [binding("w1", "t1", "Stop", 400)],
			terminalSeenAt: { t1: 150 },
			cloud: [],
		});
		expect(again.map((row) => row.finishedAt)).toEqual([400]);
	});

	test("a workspace that also has an agent working or waiting for permission is not finished, as in the sidebar", () => {
		expect(
			deriveFinishedWorkspaces({
				bindings: [
					binding("w1", "t1", "Stop", 100),
					binding("w1", "t2", "Start", 120),
					binding("w2", "t3", "Stop", 100),
					binding("w2", "t4", "PermissionRequest", 90),
				],
				terminalSeenAt: {},
				cloud: [],
			}),
		).toEqual([]);
	});

	test("a cloud workspace counts while it is in the sidebar, in review, and unread", () => {
		const rows = deriveFinishedWorkspaces({
			bindings: [],
			terminalSeenAt: {},
			cloud: [
				cloud("c1", "review", 500),
				cloud("c2", "review", 500, { lastReadAt: 600 }),
				cloud("c3", "working", 500),
				cloud("c4", "review", 500, { inSidebar: false }),
				cloud("c5", "review", null),
			],
		});
		expect(rows).toEqual([
			{
				workspaceId: "c1",
				location: "cloud",
				terminalId: null,
				agentId: null,
				finishedAt: 500,
				terminals: [],
			},
		]);
	});

	test("newest first across local and cloud", () => {
		const rows = deriveFinishedWorkspaces({
			bindings: [binding("w1", "t1", "Stop", 100)],
			terminalSeenAt: {},
			cloud: [cloud("c1", "review", 900)],
		});
		expect(rows.map((row) => row.workspaceId)).toEqual(["c1", "w1"]);
	});
});

import { describe, expect, test } from "bun:test";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { HomeListItem } from "../../types";
import { buildHostSection } from "../buildHostSection";
import { buildAllHostsList } from "./buildAllHostsList";

const workspace = (
	id: string,
	hostId: string,
	projectId: string | null = "p1",
): HostWorkspaceItem =>
	({
		id,
		hostId,
		projectId,
		name: id,
		branch: id,
		tags: [],
		hostReachable: true,
	}) as unknown as HostWorkspaceItem;

const options = {
	sort: "manual" as const,
	pinnedAt: {},
	activityTs: () => 0,
	rowAttention: () => null,
	isCollapsed: () => false,
	noProjectName: "No project",
};

const project = {
	id: "p1",
	name: "demo",
	iconUrl: null,
	repoOwner: null,
	repoName: null,
	createdAt: 1,
};

const describeItem = (item: HomeListItem) => {
	switch (item.kind) {
		case "hostLabel":
			return `label:${item.name}${item.status === "online" ? "" : `:${item.status}`}`;
		case "projectHeader":
			return `project:${item.name}${item.offline ? ":offline" : ""}`;
		case "workspace":
			return `ws:${item.workspace.id}${item.offline ? ":offline" : ""}`;
		case "cloudRow":
			return `cloud:${item.row.id}`;
		case "placeEmpty":
			return `empty:${item.label ?? "loading"}`;
		default:
			return item.kind;
	}
};

describe("buildAllHostsList", () => {
	test("lists online hosts by name, then Cloud, then offline hosts with their cached rows", () => {
		const section = (machineId: string, offline: boolean) =>
			buildHostSection(
				{
					machineId,
					workspaces: [workspace(`${machineId}-ws`, machineId)],
					projects: [project],
					tagSettings: [],
					offline,
				},
				options,
			);
		const list = buildAllHostsList({
			hosts: [
				{
					machineId: "m3",
					name: "Studio",
					status: "offline" as const,
					lastSeenAt: 1,
					items: section("m3", true),
				},
				{
					machineId: "m2",
					name: "Zeta",
					status: "online" as const,
					items: section("m2", false),
				},
				{
					machineId: "m1",
					name: "Alpha",
					status: "online" as const,
					items: section("m1", false),
				},
			],
			cloud: {
				name: "Cloud",
				items: [{ kind: "cloudRow", row: { id: "c1" } as never }],
			},
		});
		expect(list.map(describeItem)).toEqual([
			"label:Alpha",
			"project:demo",
			"ws:m1-ws",
			"label:Zeta",
			"project:demo",
			"ws:m2-ws",
			"label:Cloud",
			"cloud:c1",
			"label:Studio:offline",
			"project:demo:offline",
			"ws:m3-ws:offline",
		]);
	});

	test("says why an empty place has no rows, and only when that is known", () => {
		const list = buildAllHostsList({
			hosts: [
				{
					machineId: "m1",
					name: "Alpha",
					status: "online" as const,
					items: [],
				},
				{
					machineId: "m2",
					name: "Studio",
					status: "offline" as const,
					lastSeenAt: null,
					items: [],
					empty: { label: "No saved workspaces" },
				},
			],
			cloud: {
				name: "Cloud",
				items: [],
				empty: { label: "No cloud workspaces yet" },
			},
		});
		expect(list.map(describeItem)).toEqual([
			"label:Alpha",
			"label:Cloud",
			"empty:No cloud workspaces yet",
			"label:Studio:offline",
			"empty:No saved workspaces",
		]);
	});

	test("keeps a host with pending presence among the reachable ones, loading", () => {
		const list = buildAllHostsList({
			hosts: [
				{
					machineId: "m1",
					name: "Alpha",
					status: "pending",
					items: [],
					empty: { label: null },
				},
			],
			cloud: { name: "Cloud", items: [] },
		});
		expect(list.map(describeItem)).toEqual([
			"label:Alpha:pending",
			"empty:loading",
			"label:Cloud",
		]);
	});

	test("marks only the first label as the list's first item", () => {
		const list = buildAllHostsList({
			hosts: [
				{ machineId: "m1", name: "Alpha", status: "online", items: [] },
				{ machineId: "m2", name: "Beta", status: "online", items: [] },
			],
			cloud: null,
		});
		expect(
			list.map((item) => (item.kind === "hostLabel" ? !!item.first : null)),
		).toEqual([true, false]);
	});

	test("leaves Cloud out where it is not offered", () => {
		const list = buildAllHostsList({
			hosts: [
				{
					machineId: "m1",
					name: "Alpha",
					status: "online" as const,
					items: [],
				},
			],
			cloud: null,
		});
		expect(list.map(describeItem)).toEqual(["label:Alpha"]);
	});
});

describe("buildHostSection", () => {
	test("keeps only the host's own rows and drops rows whose worktree is gone", () => {
		const gone = { ...workspace("gone", "m1"), worktreeExists: false };
		const items = buildHostSection(
			{
				machineId: "m1",
				workspaces: [workspace("a", "m1"), workspace("b", "m2"), gone],
				projects: [project],
				tagSettings: [],
				offline: false,
			},
			options,
		);
		expect(items.map(describeItem)).toEqual(["project:demo", "ws:a"]);
	});

	test("hides a collapsed project's rows under its own host's key", () => {
		const items = buildHostSection(
			{
				machineId: "m1",
				workspaces: [workspace("a", "m1")],
				projects: [project],
				tagSettings: [],
				offline: false,
			},
			{
				...options,
				isCollapsed: (machineId, key) => machineId === "m1" && key === "p1",
			},
		);
		expect(items.map(describeItem)).toEqual(["project:demo"]);
	});
});

import { describe, expect, test } from "bun:test";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { HomeListItem } from "../../types";
import { buildHostSection } from "./buildHostSection";

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
	lifted: new Set<string>(),
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
		case "placeLabel":
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

	test("leaves pinned rows to the Pinned section: counts drop, an emptied project hides", () => {
		const items = buildHostSection(
			{
				machineId: "m1",
				workspaces: [
					workspace("a", "m1"),
					workspace("b", "m1"),
					workspace("solo", "m1", null),
				],
				projects: [project],
				tagSettings: [],
				offline: false,
			},
			{ ...options, lifted: new Set(["a", "solo"]) },
		);
		expect(items.map(describeItem)).toEqual(["project:demo", "ws:b"]);
		expect(items[0]).toMatchObject({ count: 1 });
	});

	test("joins the bars of adjacent coloured groups and frees the ends next to anything else", () => {
		const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		const tagged = (id: string, projectId: string, tags: string[]) => ({
			...workspace(id, "m1", projectId),
			tags,
		});
		const items = buildHostSection(
			{
				machineId: "m1",
				workspaces: [
					tagged("loose", P1, []),
					tagged("fix-1", P1, ["fix"]),
					tagged("fix-2", P1, ["fix"]),
					tagged("docs-1", P1, ["docs"]),
					tagged("plain-1", P1, ["plain"]),
					tagged("p2-1", P2, ["red"]),
				],
				projects: [
					{ ...project, id: P1, name: "one", createdAt: 2 },
					{ ...project, id: P2, name: "two", createdAt: 1 },
				],
				tagSettings: [
					{ projectId: P1, tag: "fix", color: "#ff0000", tabOrder: 1 },
					{ projectId: P1, tag: "docs", color: "#0000ff", tabOrder: 2 },
					{ projectId: P1, tag: "plain", tabOrder: 3 },
					{ projectId: P2, tag: "red", color: "#ff0000", tabOrder: 1 },
				],
				offline: false,
			},
			options,
		);
		const bars = items.flatMap((item) => {
			const bar =
				item.kind === "folderHeader"
					? item.bar
					: item.kind === "workspace"
						? item.group?.bar
						: undefined;
			const name =
				item.kind === "folderHeader"
					? `group:${item.folder.name}`
					: item.kind === "workspace"
						? item.workspace.id
						: `project:${item.kind === "projectHeader" ? item.name : ""}`;
			return [
				[
					name,
					bar
						? `${bar.joinTop ? "joined" : "free"}-${bar.joinBottom ? "joined" : "free"}`
						: "none",
				],
			];
		});
		expect(bars).toEqual([
			["project:one", "none"],
			["loose", "none"],
			["group:fix", "free-joined"],
			["fix-1", "joined-joined"],
			["fix-2", "joined-joined"],
			["group:docs", "joined-joined"],
			["docs-1", "joined-free"],
			["group:plain", "none"],
			["plain-1", "none"],
			["project:two", "none"],
			["group:red", "free-joined"],
			["p2-1", "joined-free"],
		]);
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

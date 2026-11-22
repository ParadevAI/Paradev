import { describe, expect, test } from "bun:test";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { selectedHosts } from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import type { HomeListItem } from "../../types";
import { buildHostSection } from "../buildHostSection";
import { buildPlacesList } from "./buildPlacesList";

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

describe("buildPlacesList", () => {
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
		const list = buildPlacesList({
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
		const list = buildPlacesList({
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
		const list = buildPlacesList({
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
		const list = buildPlacesList({
			hosts: [
				{ machineId: "m1", name: "Alpha", status: "online", items: [] },
				{ machineId: "m2", name: "Beta", status: "online", items: [] },
			],
			cloud: null,
		});
		expect(
			list.map((item) => (item.kind === "placeLabel" ? !!item.first : null)),
		).toEqual([true, false]);
	});

	test("lists only the ticked hosts of a 2-of-4 selection, with Cloud unticked", () => {
		const org = ["Alpha", "Beta", "Gamma", "Delta"].map((name) => ({
			machineId: name.toLowerCase(),
			name,
			isOnline: name !== "Delta",
		}));
		const ticked = selectedHosts(org, {
			hosts: ["delta", "beta"],
		});
		const list = buildPlacesList({
			hosts: ticked.map((host) => ({
				machineId: host.machineId,
				name: host.name,
				status: host.isOnline ? ("online" as const) : ("offline" as const),
				items: [],
			})),
			cloud: null,
		});
		expect(list.map(describeItem)).toEqual([
			"label:Beta",
			"label:Delta:offline",
		]);
	});

	test("a collapsed host hides its rows and empty note, keeping its header", () => {
		const list = buildPlacesList({
			hosts: [
				{
					machineId: "m1",
					name: "Alpha",
					status: "online",
					collapsed: true,
					attentions: [null],
					items: [{ kind: "workspace", workspace: workspace("a", "m1") }],
				},
				{
					machineId: "m2",
					name: "Studio",
					status: "offline",
					collapsed: true,
					items: [],
					empty: { label: "No saved workspaces" },
				},
			],
			cloud: { name: "Cloud", items: [], empty: { label: "None yet" } },
		});
		expect(list.map(describeItem)).toEqual([
			"label:Alpha",
			"label:Cloud",
			"empty:None yet",
			"label:Studio:offline",
		]);
	});

	test("a collapsed place's header rolls up the most urgent state and the count", () => {
		const place = (collapsed: boolean) =>
			buildPlacesList({
				hosts: [
					{
						machineId: "m1",
						name: "Alpha",
						status: "online",
						collapsed,
						attentions: ["review", "permission", "working", null],
						items: [],
					},
				],
				cloud: null,
			})[0];
		expect(place(true)).toMatchObject({
			kind: "placeLabel",
			collapsed: true,
			count: 4,
			attention: "permission",
		});
		expect(place(false)).toMatchObject({ count: 4, attention: null });
	});

	test("leaves Cloud out where it is not offered", () => {
		const list = buildPlacesList({
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

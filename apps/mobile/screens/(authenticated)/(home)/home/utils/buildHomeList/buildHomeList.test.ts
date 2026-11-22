import { describe, expect, test } from "bun:test";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { HomeListItem } from "../../types";
import {
	buildHomeList,
	type HomeListHost,
	type HomeListInput,
} from "./buildHomeList";

const workspace = (id: string, hostId: string): HostWorkspaceItem =>
	({
		id,
		hostId,
		projectId: null,
		name: id,
		branch: id,
		tags: [],
		hostReachable: true,
	}) as unknown as HostWorkspaceItem;

const host = (
	machineId: string,
	ids: string[],
	online = true,
): HomeListHost => ({
	machineId,
	name: machineId,
	isOnline: online,
	status: online ? "online" : "offline",
	state: {
		workspaces: ids.map((id) => workspace(id, machineId)),
		isReady: true,
		failed: false,
	},
	projects: [],
	tagSettings: [],
});

const input = (overrides: Partial<HomeListInput>): HomeListInput => ({
	scope: "multi",
	hosts: [],
	cloudRows: [],
	cloudRepos: { status: "pending" },
	cloudHasRows: false,
	cloudInPlaces: false,
	archived: false,
	needsMeActive: false,
	sort: "active",
	pinnedAt: {},
	collapsed: {},
	activityTs: () => 0,
	hostAttention: () => "review",
	cloudAttention: () => null,
	labels: {
		noProject: "No project",
		cloud: "Cloud",
		pinned: "Pinned",
		needsInput: "Needs input",
		readyForReview: "Ready for review",
		working: "Working",
		hostFailed: "failed",
		hostEmpty: "empty",
		nothingSaved: "nothing saved",
		cloudNoMatch: "no match",
		cloudEmpty: "cloud empty",
	},
	...overrides,
});

const workspaceIds = (items: HomeListItem[]) =>
	items.flatMap((item) =>
		item.kind === "workspace" ? [item.workspace.id] : [],
	);

describe("buildHomeList", () => {
	test("lists a pinned row once, at the top, and leaves it out of its project", () => {
		const list = buildHomeList(
			input({ hosts: [host("m1", ["a", "b"])], pinnedAt: { b: 1 } }),
		);
		expect(list.items[0]).toMatchObject({ kind: "placeLabel", name: "Pinned" });
		expect(workspaceIds(list.items)).toEqual(["b", "a"]);
	});

	test("counts a pinned row once in Needs me", () => {
		const list = buildHomeList(
			input({
				hosts: [host("m1", ["a", "b"])],
				pinnedAt: { b: 1 },
				needsMeActive: true,
			}),
		);
		expect(list.needsMeTotal).toBe(2);
		expect(workspaceIds(list.items)).toEqual(["a", "b"]);
	});

	test("leaves an offline host's rows out of Needs me", () => {
		const list = buildHomeList(
			input({
				hosts: [host("m1", ["a"]), host("m2", ["x"], false)],
				needsMeActive: true,
			}),
		);
		expect(list.needsMeTotal).toBe(1);
		expect(workspaceIds(list.items)).toEqual(["a"]);
	});

	test("shows the placeholder for one offline host with nothing cached", () => {
		const offline = { ...host("m1", [], false), state: undefined };
		const list = buildHomeList(input({ scope: "host", hosts: [offline] }));
		expect(list.showOfflinePlaceholder).toBe(true);
		expect(list.needsMeHidden).toBe(true);
		expect(list.items).toEqual([
			{ kind: "hostOffline", hostName: "m1", lastSeenAt: undefined },
		]);
	});
});

import { describe, expect, test } from "bun:test";
import type { ProjectSnapshotPayload } from "@superset/workspace-client";
import {
	applyProjectChangedEvent,
	findHostProjectRow,
	getPrimaryRepository,
	type HostRepository,
	isHostProjectRow,
	mergeHostProjects,
	toHostProjectRow,
} from "./useHostProjects.utils";

const tagSettings = [
	{
		tag: "api",
		displayName: "API",
		color: "#ff0000",
		tabOrder: null,
	},
];

function repository(
	id: string,
	overrides: Partial<HostRepository> = {},
): HostRepository {
	return {
		id,
		projectId: "project",
		isPrimary: false,
		name: id,
		path: `/repos/${id}`,
		provider: null,
		owner: null,
		repoName: null,
		url: null,
		remoteName: null,
		sparseCheckoutPaths: [],
		pathState: "ok",
		...overrides,
	};
}

function snapshot(
	overrides: Partial<ProjectSnapshotPayload> = {},
): ProjectSnapshotPayload {
	return {
		id: "project",
		name: "Project",
		primaryRepositoryId: "web",
		repositories: [repository("api"), repository("web", { isPrimary: true })],
		worktreeBaseDir: null,
		branchPrefixMode: null,
		branchPrefixCustom: null,
		namingInstructions: null,
		icon: null,
		color: null,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

const localTarget = {
	machineId: "local",
	organizationId: "org",
	hostUrl: "http://127.0.0.1",
	isLocal: true,
};
const remoteTarget = {
	machineId: "remote",
	organizationId: "org",
	hostUrl: null,
	isLocal: false,
};

describe("getPrimaryRepository", () => {
	test("returns the primary, not the first by name", () => {
		expect(getPrimaryRepository(snapshot())?.id).toBe("web");
	});
});

describe("isHostProjectRow", () => {
	test("drops rows saved before projects had repositories", () => {
		expect(isHostProjectRow({ id: "project", repoPath: "/tmp/project" })).toBe(
			false,
		);
		expect(isHostProjectRow(toHostProjectRow(snapshot()))).toBe(true);
	});
});

describe("applyProjectChangedEvent", () => {
	test("replaces the repositories and keeps tag settings a snapshot omits", () => {
		const existing = toHostProjectRow(snapshot({ tagSettings }));
		const next = applyProjectChangedEvent(
			[existing],
			{
				eventType: "updated",
				project: snapshot({
					primaryRepositoryId: "api",
					repositories: [repository("api", { isPrimary: true })],
					updatedAt: 2,
				}),
			},
			"project",
		);
		expect(next?.[0]?.tagSettings).toEqual(tagSettings);
		expect(next?.[0]?.primaryRepositoryId).toBe("api");
		expect(next?.[0]?.repositories.map((r) => r.id)).toEqual(["api"]);
	});
});

describe("mergeHostProjects", () => {
	test("the local host's repositories win over a remote replica's", () => {
		const remoteRow = toHostProjectRow(
			snapshot({
				repositories: [repository("web", { path: "/remote/web" })],
				updatedAt: 5,
			}),
		);
		const localRow = toHostProjectRow(snapshot({ updatedAt: 1 }));
		const [item] = mergeHostProjects({
			hostResults: [
				{ target: remoteTarget, rows: [remoteRow], reachable: false },
				{ target: localTarget, rows: [localRow], reachable: true },
			],
		});
		expect(item?.hostIds).toEqual(["remote", "local"]);
		expect(item?.repositories.map((r) => r.path)).toEqual([
			"/repos/api",
			"/repos/web",
		]);
		expect(item?.hostReachable).toBe(true);
	});
});

describe("findHostProjectRow", () => {
	test("returns the named host's own row, not the merged local replica", () => {
		const remoteRow = toHostProjectRow(
			snapshot({ repositories: [repository("remote-web")] }),
		);
		const localRow = toHostProjectRow(snapshot());
		const hostResults = [
			{ target: localTarget, rows: [localRow], reachable: true },
			{ target: remoteTarget, rows: [remoteRow], reachable: false },
		];
		expect(
			findHostProjectRow(hostResults, "remote", "project")?.repositories.map(
				(r) => r.id,
			),
		).toEqual(["remote-web"]);
		expect(findHostProjectRow(hostResults, "missing", "project")).toBe(
			undefined,
		);
	});
});

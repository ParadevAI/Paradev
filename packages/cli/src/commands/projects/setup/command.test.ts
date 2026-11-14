import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getHostId } from "@superset/shared/host-info";
import {
	answerHostProcedures,
	type Procedure,
	withLocalHostService,
} from "../../../lib/host/test-helpers";
import setupCommand from "./command";

const PROJECT = {
	id: "project-1",
	name: "shop",
	primaryRepositoryId: "r-web",
	repositories: [
		{
			id: "r-api",
			name: "api",
			url: "https://github.com/acme/api",
			isPrimary: false,
			path: "/elsewhere/api",
		},
		{
			id: "r-web",
			name: "web",
			url: "https://github.com/acme/web",
			isPrimary: true,
			path: "/elsewhere/web",
		},
	],
};

let setupInput: Record<string, unknown> | undefined;
let setupCalls: Record<string, unknown>[];
let localProject: typeof PROJECT | null;
let localDeleted: boolean;
let localListsDeleted: boolean;
let localFolderTaken: boolean;
let setupCreates: boolean;
let hostListFails: boolean;

withLocalHostService("org-1", {
	"project.get": (input) =>
		localProject ??
		(localDeleted && localListsDeleted && input.includeDeleted
			? { ...PROJECT, deleted: true }
			: null),
	"project.setup": (input) => {
		if (!input.origin && !localProject && !localDeleted) {
			throw new Error("not_set_up: project project-1 is not on this host");
		}
		const repositories = input.repositories as { id: string }[];
		if (localFolderTaken && !repositories.some((r) => r.id === "r-api")) {
			throw new Error("repository_taken: /elsewhere/api is another project's");
		}
		setupInput = input;
		setupCalls.push(input);
		const origin = input.origin as typeof PROJECT | undefined;
		return {
			...PROJECT,
			repositories: (origin ?? PROJECT).repositories.map((r) => ({
				...r,
				path: `/here/${r.name}`,
			})),
			created: setupCreates,
		};
	},
});

const remoteHosts: Record<string, Record<string, Procedure>> = {};
const relay = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	fetch: (request) => {
		const [, key = "", paths = ""] =
			new URL(request.url).pathname.match(/^\/hosts\/([^/]+)\/trpc\/(.+)$/) ??
			[];
		const hostId = decodeURIComponent(key).replace(/^org-1:/, "");
		return answerHostProcedures(request, paths, remoteHosts[hostId] ?? {});
	},
});
afterAll(() => relay.stop(true));

const hasProject = { "project.get": () => PROJECT };
const lacksProject = {
	"project.get": () => null,
	"project.setup": () => {
		throw new Error("not_set_up: project project-1 is not on this host");
	},
};

const api = {
	host: {
		relayEndpoint: { query: async () => ({ url: relay.url.origin }) },
		list: {
			query: async () => {
				if (hostListFails) throw new Error("fetch failed");
				return [
					{ id: getHostId(), name: "laptop", online: true },
					{ id: "host-a", name: "server-a", online: true },
					{ id: "host-b", name: "server-b", online: true },
				];
			},
		},
	},
};

function invoke(options: Record<string, unknown>) {
	return setupCommand.run({
		ctx: { api, config: { organizationId: "org-1" }, bearer: "b" } as never,
		args: { id: "project-1" } as never,
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	}) as Promise<{ data: Record<string, unknown>; message: string }>;
}

beforeEach(() => {
	setupInput = undefined;
	setupCalls = [];
	localProject = null;
	localDeleted = false;
	localListsDeleted = true;
	localFolderTaken = false;
	setupCreates = true;
	hostListFails = false;
	remoteHosts["host-a"] = hasProject;
	remoteHosts["host-b"] = lacksProject;
});

describe("projects setup", () => {
	test("builds the origin from the only other host that has the project", async () => {
		const result = await invoke({ cloneInto: "/src" });
		expect(setupInput?.origin).toEqual({
			name: "shop",
			primaryRepositoryId: "r-web",
			repositories: [
				{ id: "r-api", name: "api", url: "https://github.com/acme/api" },
				{ id: "r-web", name: "web", url: "https://github.com/acme/web" },
			],
		});
		expect(result.message).toContain("from host host-a");
		expect(result.message).toContain("api  /here/api  (set up)");
	});

	test("--clone-into clones every repository into one directory", async () => {
		await invoke({ cloneInto: "/src" });
		expect(setupInput?.repositories).toEqual([
			{ id: "r-api", mode: { kind: "clone", parentDir: "/src" } },
			{ id: "r-web", mode: { kind: "clone", parentDir: "/src" } },
		]);
	});

	test("--path places the repository it names instead of --clone-into", async () => {
		await invoke({ cloneInto: "/src", path: ["API=/code/api"] });
		expect(setupInput?.repositories).toEqual([
			{ id: "r-api", mode: { kind: "import", path: "/code/api" } },
			{ id: "r-web", mode: { kind: "clone", parentDir: "/src" } },
		]);
	});

	test("--path refuses a repository the project does not have", async () => {
		await expect(invoke({ path: ["docs=/code/docs"] })).rejects.toThrow(
			'Project shop has no repository "docs"',
		);
		expect(setupInput).toBeUndefined();
	});

	test("asks for --from-host when several hosts have the project", async () => {
		remoteHosts["host-b"] = hasProject;
		await expect(invoke({ cloneInto: "/src" })).rejects.toThrow(
			"Several hosts have project project-1: server-a (host-a), server-b (host-b)",
		);
		expect(setupInput).toBeUndefined();
	});

	test("uses --from-host when several hosts have the project", async () => {
		remoteHosts["host-b"] = hasProject;
		const result = await invoke({ cloneInto: "/src", fromHost: "host-b" });
		expect(result.message).toContain("from host host-b");
	});

	test("asks for a folder for every repository it would not place", async () => {
		await expect(invoke({ path: ["api=/code/api"] })).rejects.toThrow(
			"Pick a folder for web",
		);
		expect(setupInput).toBeUndefined();
	});

	test("refuses a relative path for another host", async () => {
		await expect(
			invoke({ local: undefined, host: "host-b", path: ["api=code/api"] }),
		).rejects.toThrow("code/api is not an absolute path");
	});

	test("on a host that has the project, sends no origin and says what moved", async () => {
		localProject = {
			...PROJECT,
			repositories: PROJECT.repositories.map((r) => ({
				...r,
				path: r.name === "api" ? "/here/api" : "/old/web",
			})),
		};
		setupCreates = false;
		const result = await invoke({ path: ["web=/here/web"] });
		expect(setupInput?.origin).toBeUndefined();
		expect(result.message).toContain('Project "shop" is already on host');
		expect(result.message).toContain("api  /here/api  (already there)");
		expect(result.message).toContain("web  /here/web  (moved)");
	});

	test("--allow-relocate applies to --path folders, not to clones", async () => {
		localProject = PROJECT;
		setupCreates = false;
		await invoke({
			cloneInto: "/src",
			path: ["api=/code/api"],
			allowRelocate: true,
		});
		expect(setupInput?.repositories).toEqual([
			{
				id: "r-api",
				mode: { kind: "import", path: "/code/api", allowRelocate: true },
			},
			{ id: "r-web", mode: { kind: "clone", parentDir: "/src" } },
		]);
	});

	test("refuses --allow-relocate without --path", async () => {
		await expect(
			invoke({ cloneInto: "/src", allowRelocate: true }),
		).rejects.toThrow("--allow-relocate only applies to --path");
		expect(setupInput).toBeUndefined();
	});

	describe("a repository another host added to a project this host has", () => {
		const docs = {
			id: "r-docs",
			name: "docs",
			url: "https://github.com/acme/docs",
			isPrimary: false,
			path: "/elsewhere/docs",
		};

		beforeEach(() => {
			localProject = PROJECT;
			setupCreates = false;
			remoteHosts["host-a"] = {
				"project.get": () => ({
					...PROJECT,
					repositories: [...PROJECT.repositories, docs],
				}),
			};
		});

		test("is set up from that host's origin", async () => {
			const result = await invoke({ cloneInto: "/src" });
			expect(
				(setupInput?.origin as typeof PROJECT).repositories.map((r) => r.id),
			).toEqual(["r-api", "r-web", "r-docs"]);
			expect(setupInput?.repositories).toContainEqual({
				id: "r-docs",
				mode: { kind: "clone", parentDir: "/src" },
			});
			expect(result.message).toContain(
				"docs  /here/docs  (added from host host-a)",
			);
		});

		test("a failed host lookup warns and sets up as before", async () => {
			hostListFails = true;
			const stderr = spyOn(process.stderr, "write").mockImplementation(
				() => true,
			);
			try {
				await invoke({ path: ["web=/here/web"] });
				expect(stderr).toHaveBeenCalledWith(
					"Could not ask other hosts for repositories added there: fetch failed\n",
				);
			} finally {
				stderr.mockRestore();
			}
			expect(setupInput?.origin).toBeUndefined();
			expect(setupInput?.repositories).toEqual([
				{ id: "r-web", mode: { kind: "import", path: "/here/web" } },
			]);
		});

		test("refuses when hosts added different repositories", async () => {
			remoteHosts["host-b"] = {
				"project.get": () => ({
					...PROJECT,
					repositories: [
						...PROJECT.repositories,
						{ ...docs, id: "r-ops", name: "ops" },
					],
				}),
			};
			await expect(invoke({ cloneInto: "/src" })).rejects.toThrow(
				"Hosts list different repositories for project project-1",
			);
			expect(setupInput).toBeUndefined();
		});

		test("needs a placement", async () => {
			await expect(invoke({})).rejects.toThrow(
				"Pick a folder for docs, added to the project on host host-a",
			);
			expect(setupInput).toBeUndefined();
		});
	});

	test("restores a project this host deleted without another host", async () => {
		localDeleted = true;
		setupCreates = false;
		remoteHosts["host-a"] = lacksProject;
		const result = await invoke({ cloneInto: "/src" });
		expect(setupCalls).toEqual([
			{
				projectId: "project-1",
				repositories: [
					{ id: "r-api", mode: { kind: "clone", parentDir: "/src" } },
					{ id: "r-web", mode: { kind: "clone", parentDir: "/src" } },
				],
			},
		]);
		expect(result.message).toContain('Restored project "shop" on host');
		expect(result.message).toContain("api  /here/api  (restored)");
		expect(result.message).not.toContain("moved");
	});

	test("restores a deleted project and moves it to a new folder in one call when another project took its old folder", async () => {
		localDeleted = true;
		localFolderTaken = true;
		setupCreates = false;
		remoteHosts["host-a"] = lacksProject;
		const result = await invoke({
			path: ["api=/code/api2"],
			allowRelocate: true,
		});
		expect(setupCalls).toEqual([
			{
				projectId: "project-1",
				repositories: [
					{
						id: "r-api",
						mode: { kind: "import", path: "/code/api2", allowRelocate: true },
					},
				],
			},
		]);
		expect(result.message).toContain('Restored project "shop" on host');
	});

	test("on a host that cannot list deleted projects, restores first, then places", async () => {
		localDeleted = true;
		localListsDeleted = false;
		setupCreates = false;
		remoteHosts["host-a"] = lacksProject;
		await invoke({ cloneInto: "/src" });
		expect(setupCalls.map((call) => call.repositories)).toEqual([
			[],
			[
				{ id: "r-api", mode: { kind: "clone", parentDir: "/src" } },
				{ id: "r-web", mode: { kind: "clone", parentDir: "/src" } },
			],
		]);
	});

	test("restores a deleted project in place when no folder is given", async () => {
		localDeleted = true;
		setupCreates = false;
		const result = await invoke({});
		expect(setupCalls).toEqual([{ projectId: "project-1", repositories: [] }]);
		expect(result.message).toContain('Restored project "shop" on host');
	});
});

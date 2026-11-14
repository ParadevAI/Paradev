import { afterAll, beforeEach, describe, expect, test } from "bun:test";
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

withLocalHostService("org-1", {
	"project.get": () => null,
	"project.setup": (input) => {
		setupInput = input;
		return {
			...PROJECT,
			repositories: PROJECT.repositories.map((r) => ({
				...r,
				path: `/here/${r.name}`,
			})),
			created: true,
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
const lacksProject = { "project.get": () => null };

const api = {
	host: {
		relayEndpoint: { query: async () => ({ url: relay.url.origin }) },
		list: {
			query: async () => [
				{ id: getHostId(), name: "laptop", online: true },
				{ id: "host-a", name: "server-a", online: true },
				{ id: "host-b", name: "server-b", online: true },
			],
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
});

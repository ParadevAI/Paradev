import { describe, expect, test } from "bun:test";
import type { CloudCreateChoice } from "renderer/stores/v2-workspace-create-defaults";
import { resolveCloudChoices } from "./resolveCloudChoices";

const web = {
	id: "env-web",
	projectIds: ["project-web"],
	repositories: [{ fullName: "acme/web" }],
};
const api = {
	id: "env-api",
	projectIds: [],
	repositories: [{ fullName: "acme/api" }],
};
const webGpu = {
	id: "env-web-gpu",
	projectIds: [],
	repositories: [{ fullName: "acme/web" }],
};
const environments = [web, api, webGpu];
const sizes = ["small", "medium", "large"] as const;

function resolve(
	projectId: string | null,
	choices: Record<string, CloudCreateChoice> = {},
	repositoryFullName: string | null = projectId ? "acme/web" : null,
) {
	return resolveCloudChoices({
		environments,
		projectId,
		repositoryFullName,
		choices,
		offeredSizes: [...sizes],
		defaultSize: "medium",
	});
}

describe("resolveCloudChoices", () => {
	test("a project with no memory takes its first linked environment", () => {
		const result = resolve("project-web");
		expect(result.environment?.id).toBe("env-web");
		expect(result.linked.map((row) => row.id)).toEqual([
			"env-web",
			"env-web-gpu",
		]);
		expect(result.other.map((row) => row.id)).toEqual(["env-api"]);
		expect(result.machineSize).toBe("medium");
	});

	test("a project keeps an environment picked for it, linked or not", () => {
		const result = resolve("project-web", {
			"project-web": { environmentId: "env-api", usedAt: 1 },
		});
		expect(result.environment?.id).toBe("env-api");
	});

	test("an unlinked project does not inherit another project's environment", () => {
		const result = resolve(
			"project-docs",
			{ "project-web": { environmentId: "env-web", usedAt: 1 } },
			"acme/docs",
		);
		expect(result.environment).toBeNull();
		expect(result.other).toHaveLength(3);
	});

	test("no project takes the newest environment used anywhere", () => {
		const result = resolve(null, {
			"project-web": { environmentId: "env-web", usedAt: 1 },
			"project-api": { environmentId: "env-api", usedAt: 2 },
		});
		expect(result.environment?.id).toBe("env-api");
		expect(result.linked).toEqual([]);
		expect(result.other).toHaveLength(3);
	});

	test("no project with no memory takes the first environment", () => {
		expect(resolve(null).environment?.id).toBe("env-web");
	});

	test("an archived remembered environment falls back", () => {
		const result = resolve("project-web", {
			"project-web": { environmentId: "env-gone", usedAt: 1 },
		});
		expect(result.environment?.id).toBe("env-web");
	});

	test("machine size: the project's, else the newest anywhere, else the default", () => {
		expect(
			resolve("project-web", {
				"project-web": { machineSize: "large", usedAt: 1 },
				"": { machineSize: "small", usedAt: 2 },
			}).machineSize,
		).toBe("large");
		expect(
			resolve("project-docs", {
				"project-web": { machineSize: "large", usedAt: 1 },
				"": { machineSize: "small", usedAt: 2 },
			}).machineSize,
		).toBe("small");
	});

	test("a size the organization no longer offers is skipped", () => {
		expect(
			resolve("project-web", {
				"project-web": { machineSize: "2xlarge", usedAt: 2 },
				"": { machineSize: "large", usedAt: 1 },
			}).machineSize,
		).toBe("large");
	});
});

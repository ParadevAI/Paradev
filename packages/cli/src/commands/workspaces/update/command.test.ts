import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import updateCommand from "./command";

const WORKSPACE_ID = "b502bf30-8693-4815-be65-795035e0ce5f";
const PROJECT_ID = "proj-1";

let hostHasTagFolders = true;
let cloudAvailable = false;
let cloudSetTagsInput: Record<string, unknown> | undefined;
let tagSettings: Array<Record<string, unknown>> = [];
let upsertInput: Record<string, unknown> | undefined;
let updateInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"workspace.list": () => [
		{ id: WORKSPACE_ID, projectId: PROJECT_ID, tags: ["automation"] },
		{ id: "other", projectId: PROJECT_ID, tags: ["new group"] },
	],
	"tagFolders.list": () => {
		if (!hostHasTagFolders) {
			throw new Error('No procedure found on path "tagFolders.list"');
		}
		return tagSettings;
	},
	"tagFolders.upsert": (input) => {
		if (!hostHasTagFolders) {
			throw new Error('No procedure found on path "tagFolders.upsert"');
		}
		upsertInput = input;
		return { tagSettings: [] };
	},
	"workspace.update": (input) => {
		updateInput = input;
		return { id: input.id, tags: input.tags };
	},
});

function invoke(options: Record<string, unknown>) {
	return updateCommand.run({
		ctx: {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: cloudAvailable }) },
					setTags: {
						mutate: async (input: Record<string, unknown>) => {
							cloudSetTagsInput = input;
							return { id: input.id, tags: input.tags };
						},
					},
				},
			},
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: { id: WORKSPACE_ID } as never,
		options: { local: true, ...options } as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	hostHasTagFolders = true;
	cloudAvailable = false;
	cloudSetTagsInput = undefined;
	tagSettings = [];
	upsertInput = undefined;
	updateInput = undefined;
});

describe("workspaces update --group", () => {
	test("moves the workspace into the group shown by that name", async () => {
		tagSettings = [
			{ scope: PROJECT_ID, tag: "new group", displayName: "Sales" },
		];
		await invoke({ group: "sales" });
		expect(updateInput).toMatchObject({ tags: ["new group"] });
		expect(upsertInput).toBeUndefined();
	});

	test("makes a new group that keeps the name as typed", async () => {
		await invoke({ group: "Active Build" });
		expect(upsertInput).toEqual({
			scope: PROJECT_ID,
			tag: "active build",
			displayName: "Active Build",
		});
		expect(updateInput).toMatchObject({ tags: ["active build"] });
	});

	test("still files the workspace on a host without tag folders", async () => {
		hostHasTagFolders = false;
		await invoke({ group: "Review" });
		expect(upsertInput).toBeUndefined();
		expect(updateInput).toMatchObject({ tags: ["review"] });
	});

	test("rejects --group on a cloud workspace, where --tag still files it", async () => {
		cloudAvailable = true;
		await expect(invoke({ local: false, group: "Review" })).rejects.toThrow(
			/--group does not apply to a cloud workspace/,
		);
		await invoke({ local: false, tag: ["review"] });
		expect(cloudSetTagsInput).toEqual({ id: WORKSPACE_ID, tags: ["review"] });
		expect(updateInput).toBeUndefined();
	});

	test("rejects --group with --tag", async () => {
		await expect(invoke({ group: "Review", tag: ["perf"] })).rejects.toThrow(
			/Cannot combine --group with --tag or --clear-tags/,
		);
		expect(updateInput).toBeUndefined();
	});
});

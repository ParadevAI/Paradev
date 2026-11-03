import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTree, CLIError, routeCommand } from "@superset/cli-framework";

const previousHome = process.env.SUPERSET_HOME_DIR;
const home = mkdtempSync(join(tmpdir(), "superset-ws-archive-"));
process.env.SUPERSET_HOME_DIR = home;

const { default: archiveCommand } = await import("./command");
const { default: workspacesMeta } = await import("../meta");

afterAll(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
});

describe("workspaces archive", () => {
	test("archives cloud workspaces", async () => {
		const archivedIds: string[] = [];
		const ctx = {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: true }) },
					delete: {
						mutate: async ({ id }: { id: string }) => {
							archivedIds.push(id);
							return { deleted: true };
						},
					},
				},
			},
			config: { organizationId: "org-archive-test" },
		} as never;

		const result = await archiveCommand.run({
			ctx,
			args: { ids: ["ws-1"] } as never,
			options: {} as never,
			signal: new AbortController().signal,
		});

		expect(archivedIds).toEqual(["ws-1"]);
		expect(result).toEqual({
			data: { deleted: ["ws-1"], notFound: [], failed: [], warnings: [] },
			message: "Archived cloud workspace ws-1",
		});
	});

	test("a mixed cloud batch fails with every id in its data", async () => {
		const ctx = {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: true }) },
					delete: {
						mutate: async ({ id }: { id: string }) => ({
							deleted: id === "ws-1",
						}),
					},
				},
			},
			config: { organizationId: "org-archive-test" },
		} as never;

		const error = await archiveCommand
			.run({
				ctx,
				args: { ids: ["ws-1", "ws-missing"] } as never,
				options: {} as never,
				signal: new AbortController().signal,
			})
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(CLIError);
		expect((error as CLIError).data).toEqual({
			deleted: ["ws-1"],
			notFound: ["ws-missing"],
			failed: [],
			warnings: [],
		});
		expect((error as CLIError).message).toBe(
			"No cloud workspace in this organization: ws-missing (archived: ws-1)",
		);
	});

	test("a cloud delete error is reported and the batch keeps going", async () => {
		const ctx = {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: true }) },
					delete: {
						mutate: async ({ id }: { id: string }) => {
							if (id === "ws-broken") throw new Error("502 Bad Gateway");
							return { deleted: id === "ws-1" };
						},
					},
				},
			},
			config: { organizationId: "org-archive-test" },
		} as never;

		const error = await archiveCommand
			.run({
				ctx,
				args: { ids: ["ws-broken", "ws-1", "ws-missing"] } as never,
				options: {} as never,
				signal: new AbortController().signal,
			})
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(CLIError);
		expect((error as CLIError).data).toEqual({
			deleted: ["ws-1"],
			notFound: ["ws-missing"],
			failed: [{ id: "ws-broken", reason: "502 Bad Gateway" }],
			warnings: [],
		});
		expect((error as CLIError).message).toBe(
			"No cloud workspace in this organization: ws-missing\nFailed: ws-broken: 502 Bad Gateway (archived: ws-1)",
		);
	});

	test("delete still routes to archive", () => {
		const { root, commandMap } = buildTree(
			[{ path: ["workspaces"], ...workspacesMeta }],
			[{ path: ["workspaces", "archive"], command: archiveCommand as never }],
		);

		for (const group of ["workspaces", "ws"]) {
			const routed = routeCommand(root, [group, "delete", "ws-1"]);
			expect(routed.commandPath).toEqual(["workspaces", "archive"]);
			expect(routed.remainingArgs).toEqual(["ws-1"]);
		}
		expect(commandMap.get("workspaces/archive")).toBe(archiveCommand as never);
	});
});

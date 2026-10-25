import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { TRPCClientError } from "@trpc/client";
import { archiveOnHost, reportHostOutcomes } from "./archiveOnHost";

const notFound = () =>
	new TRPCClientError("Workspace not found", {
		result: { error: { data: { code: "NOT_FOUND" } } } as never,
	});

function fakeHost(
	rows: Set<string>,
	{ reportsFound }: { reportsFound: boolean },
) {
	return {
		workspace: {
			delete: {
				mutate: async ({ id }: { id: string }) => {
					if (id === "broken") throw new Error("disk on fire");
					return {
						success: true,
						warnings: [],
						...(reportsFound ? { found: rows.has(id) } : {}),
					};
				},
			},
			get: {
				query: async ({ id }: { id: string }) => {
					if (!rows.has(id)) throw notFound();
					return { id };
				},
			},
		},
	} as never;
}

describe("archiveOnHost", () => {
	for (const reportsFound of [true, false]) {
		test(`reports each id as the host saw it (host reports found: ${reportsFound})`, async () => {
			const host = fakeHost(new Set(["5a17058b-full-id"]), { reportsFound });

			const outcomes = await archiveOnHost(host, [
				"5a17058b",
				"broken",
				"5a17058b-full-id",
			]);

			expect(outcomes).toEqual([
				{ id: "5a17058b", status: "not_found" },
				{ id: "broken", status: "failed", reason: "disk on fire" },
				{ id: "5a17058b-full-id", status: "deleted", warnings: [] },
			]);
		});
	}
});

test("an older host whose follow-up check fails reports the id as failed", async () => {
	const host = {
		workspace: {
			delete: { mutate: async () => ({ success: true, warnings: [] }) },
			get: {
				query: async () => {
					throw new Error("socket hang up");
				},
			},
		},
	} as never;

	expect(await archiveOnHost(host, ["5a17058b"])).toEqual([
		{ id: "5a17058b", status: "failed", reason: "socket hang up" },
	]);
});

describe("reportHostOutcomes", () => {
	test("a mixed batch fails with every id in its data", () => {
		let error: unknown;
		try {
			reportHostOutcomes(
				[
					{ id: "ws-1", status: "deleted", warnings: ["teardown exited 1"] },
					{ id: "5a17058b", status: "not_found" },
					{ id: "broken", status: "failed", reason: "disk on fire" },
				],
				"host-1",
			);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(CLIError);
		const cliError = error as CLIError;
		expect(cliError.data).toEqual({
			deleted: ["ws-1"],
			notFound: ["5a17058b"],
			failed: [{ id: "broken", reason: "disk on fire" }],
			warnings: ["ws-1: teardown exited 1"],
		});
		expect(cliError.message).toBe(
			[
				"Archived workspace ws-1",
				"Warning: ws-1: teardown exited 1",
				"Not found: no workspace 5a17058b on host host-1",
				"Failed: broken: disk on fire",
			].join("\n"),
		);
		expect(cliError.suggestion).toContain("Pass full workspace IDs");
	});

	test("an all-deleted batch returns the same shape", () => {
		expect(
			reportHostOutcomes(
				[{ id: "ws-1", status: "deleted", warnings: [] }],
				"h",
			),
		).toEqual({
			data: { deleted: ["ws-1"], notFound: [], failed: [], warnings: [] },
			message: "Archived workspace ws-1",
		});
	});
});

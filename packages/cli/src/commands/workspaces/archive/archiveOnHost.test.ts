import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { archiveOnHost } from "./archiveOnHost";

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

import { expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { messageEditPlan } from "./messageEditPlan";

test("an older host without file-change previews keeps files untouched", async () => {
	const plan = await messageEditPlan({
		canRewindFiles: true,
		loadChanges: async () => {
			throw new TRPCClientError(
				'No procedure found on path "getRewindChanges"',
			);
		},
	});
	expect(plan).toEqual({ kind: "keep-files" });
});

test("only listed file changes request restore confirmation", async () => {
	const changes = [{ path: "notes.txt", change: "modified" as const }];
	expect(
		await messageEditPlan({
			canRewindFiles: true,
			loadChanges: async () => ({ files: "listed", changes }),
		}),
	).toEqual({ kind: "confirm", changes });
});

test("missing, unsupported and unchanged snapshots never request file restoration", async () => {
	for (const files of ["missing", "unsupported"] as const) {
		expect(
			await messageEditPlan({
				canRewindFiles: true,
				loadChanges: async () => ({ files }),
			}),
		).toEqual({ kind: "keep-files" });
	}
	expect(
		await messageEditPlan({
			canRewindFiles: true,
			loadChanges: async () => ({ files: "listed", changes: [] }),
		}),
	).toEqual({ kind: "keep-files" });
});

test("providers without checkpoints do not attempt a file preview", async () => {
	let checked = false;
	expect(
		await messageEditPlan({
			canRewindFiles: false,
			loadChanges: async () => {
				checked = true;
				return { files: "missing" };
			},
		}),
	).toEqual({ kind: "keep-files" });
	expect(checked).toBe(false);
});

test("other preview errors stop the edit rather than authorizing a restore", async () => {
	const error = new Error("host unavailable");
	await expect(
		messageEditPlan({
			canRewindFiles: true,
			loadChanges: async () => {
				throw error;
			},
		}),
	).rejects.toBe(error);
});

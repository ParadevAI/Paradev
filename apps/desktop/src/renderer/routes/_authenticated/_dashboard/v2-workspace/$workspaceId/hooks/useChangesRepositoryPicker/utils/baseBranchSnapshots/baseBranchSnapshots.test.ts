import { expect, test } from "bun:test";
import type { BaseBranchSnapshot } from "../../../../utils/multiRepoScope";
import {
	type BaseBranchSnapshotIo,
	createBaseBranchSnapshots,
} from "./baseBranchSnapshots";

const WORKSPACE_ID = "workspace-1";

/** A host whose bases the test sets; each write is recorded and lands at once unless held. */
function fakeHost(bases: Record<string, BaseBranchSnapshot | Error>) {
	const reads: string[] = [];
	const writes: Array<[string, string | null]> = [];
	const errors: unknown[] = [];
	let held: (() => void) | undefined;
	const io: BaseBranchSnapshotIo = {
		read: async (repositoryId) => {
			reads.push(repositoryId);
			const base = bases[repositoryId];
			if (!base || base instanceof Error) throw base ?? new Error("unknown");
			return base;
		},
		write: (repositoryId, baseBranch) => {
			writes.push([repositoryId, baseBranch]);
			return new Promise<void>((resolve) => {
				const land = () => {
					bases[repositoryId] = {
						branch: (bases[repositoryId] as BaseBranchSnapshot).branch,
						baseBranch,
					};
					resolve();
				};
				if (holdWrites) held = land;
				else land();
			});
		},
		onRestoreError: (error) => errors.push(error),
	};
	let holdWrites = false;
	return {
		io,
		reads,
		writes,
		errors,
		hold: () => {
			holdWrites = true;
		},
		release: () => {
			holdWrites = false;
			held?.();
		},
	};
}

const pickAlone = (repositoryId: string) => ({
	snapshotBaseBranchOf: repositoryId,
	restoreBaseBranchOf: null,
});
const showAllAfter = (repositoryId: string) => ({
	snapshotBaseBranchOf: null,
	restoreBaseBranchOf: repositoryId,
});

test("showing every repository again writes nothing without a snapshot", async () => {
	const host = fakeHost({ api: { branch: "feature", baseBranch: "dev" } });
	await createBaseBranchSnapshots().afterPick(
		WORKSPACE_ID,
		showAllAfter("api"),
		host.io,
	);
	expect(host.reads).toEqual([]);
	expect(host.writes).toEqual([]);
});

test("puts the base back only when the branch is the same and the base changed", async () => {
	const bases: Record<string, BaseBranchSnapshot> = {
		api: { branch: "feature", baseBranch: "main" },
	};
	const host = fakeHost(bases);
	const snapshots = createBaseBranchSnapshots();

	await snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	await snapshots.afterPick(WORKSPACE_ID, showAllAfter("api"), host.io);
	expect(host.writes).toEqual([]);

	await snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	bases.api = { branch: "other", baseBranch: "dev" };
	await snapshots.afterPick(WORKSPACE_ID, showAllAfter("api"), host.io);
	expect(host.writes).toEqual([]);

	await snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	bases.api = { branch: "other", baseBranch: "release" };
	await snapshots.afterPick(WORKSPACE_ID, showAllAfter("api"), host.io);
	expect(host.writes).toEqual([["api", "dev"]]);
});

test("a failed snapshot read is kept as no snapshot, so nothing is written later", async () => {
	const bases: Record<string, BaseBranchSnapshot | Error> = {
		api: new Error("host offline"),
	};
	const host = fakeHost(bases);
	const snapshots = createBaseBranchSnapshots();

	await snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	bases.api = { branch: "feature", baseBranch: "dev" };
	await snapshots.afterPick(WORKSPACE_ID, showAllAfter("api"), host.io);

	expect(host.reads).toEqual(["api"]);
	expect(host.writes).toEqual([]);
	expect(host.errors).toEqual([]);
});

test("a snapshot taken while a restore is in flight reads the restored base", async () => {
	const bases: Record<string, BaseBranchSnapshot> = {
		api: { branch: "feature", baseBranch: "main" },
	};
	const host = fakeHost(bases);
	const snapshots = createBaseBranchSnapshots();

	await snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	bases.api = { branch: "feature", baseBranch: "dev" };
	host.hold();
	const restoring = snapshots.afterPick(
		WORKSPACE_ID,
		showAllAfter("api"),
		host.io,
	);
	const retaking = snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(host.writes).toEqual([["api", "main"]]);
	const readsBeforeLanding = host.reads.length;

	host.release();
	await Promise.all([restoring, retaking]);
	expect(host.reads.length).toBe(readsBeforeLanding + 1);

	bases.api = { branch: "feature", baseBranch: "dev" };
	await snapshots.afterPick(WORKSPACE_ID, showAllAfter("api"), host.io);
	expect(host.writes).toEqual([
		["api", "main"],
		["api", "main"],
	]);
});

test("swapping one picked repository for another restores the first and snapshots the second", async () => {
	const bases: Record<string, BaseBranchSnapshot> = {
		api: { branch: "feature", baseBranch: "main" },
		web: { branch: "feature", baseBranch: "main" },
	};
	const host = fakeHost(bases);
	const snapshots = createBaseBranchSnapshots();

	await snapshots.afterPick(WORKSPACE_ID, pickAlone("api"), host.io);
	bases.api = { branch: "feature", baseBranch: "dev" };
	await snapshots.afterPick(
		WORKSPACE_ID,
		{ snapshotBaseBranchOf: "web", restoreBaseBranchOf: "api" },
		host.io,
	);
	expect(host.writes).toEqual([["api", "main"]]);

	bases.web = { branch: "feature", baseBranch: "dev" };
	await snapshots.afterPick(WORKSPACE_ID, showAllAfter("web"), host.io);
	expect(host.writes).toEqual([
		["api", "main"],
		["web", "main"],
	]);
});

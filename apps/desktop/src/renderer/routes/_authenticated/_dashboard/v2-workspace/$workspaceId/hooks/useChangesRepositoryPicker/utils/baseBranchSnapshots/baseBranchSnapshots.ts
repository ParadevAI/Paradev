import {
	type BaseBranchSnapshot,
	baseBranchToRestore,
} from "../../../../utils/multiRepoScope";

export interface BaseBranchSnapshotIo {
	read: (repositoryId: string) => Promise<BaseBranchSnapshot>;
	write: (repositoryId: string, baseBranch: string | null) => Promise<void>;
	onRestoreError: (error: unknown) => void;
}

export interface PickBaseBranchChange {
	snapshotBaseBranchOf: string | null;
	restoreBaseBranchOf: string | null;
}

export interface BaseBranchSnapshots {
	/** Settles once the restore and the snapshot it started are done. */
	afterPick: (
		workspaceId: string,
		change: PickBaseBranchChange,
		io: BaseBranchSnapshotIo,
	) => Promise<void>;
}

function snapshotKey(workspaceId: string, repositoryId: string): string {
	return JSON.stringify([workspaceId, repositoryId]);
}

/** Takes a repository's base branch when it becomes the only one shown, and puts it back when it stops being that. */
export function createBaseBranchSnapshots(): BaseBranchSnapshots {
	const snapshots = new Map<string, Promise<BaseBranchSnapshot | undefined>>();
	/** A new snapshot waits for these so it never takes a value about to be undone. */
	const pendingRestores = new Map<string, Promise<void>>();

	function take(
		workspaceId: string,
		repositoryId: string,
		io: BaseBranchSnapshotIo,
	): Promise<unknown> {
		const key = snapshotKey(workspaceId, repositoryId);
		const snapshot = (pendingRestores.get(key) ?? Promise.resolve())
			.then(() => io.read(repositoryId))
			.catch(() => undefined);
		snapshots.set(key, snapshot);
		return snapshot;
	}

	function restore(
		workspaceId: string,
		repositoryId: string,
		io: BaseBranchSnapshotIo,
	): Promise<void> {
		const key = snapshotKey(workspaceId, repositoryId);
		const snapshot = snapshots.get(key);
		if (!snapshot) return Promise.resolve();
		snapshots.delete(key);
		const restoring = (async () => {
			const taken = await snapshot;
			if (!taken) return;
			const change = baseBranchToRestore(taken, await io.read(repositoryId));
			if (change) await io.write(repositoryId, change.baseBranch);
		})()
			.catch(io.onRestoreError)
			.finally(() => {
				if (pendingRestores.get(key) === restoring) pendingRestores.delete(key);
			});
		pendingRestores.set(key, restoring);
		return restoring;
	}

	return {
		afterPick: async (workspaceId, change, io) => {
			const started: Promise<unknown>[] = [];
			if (change.restoreBaseBranchOf) {
				started.push(restore(workspaceId, change.restoreBaseBranchOf, io));
			}
			if (change.snapshotBaseBranchOf) {
				started.push(take(workspaceId, change.snapshotBaseBranchOf, io));
			}
			await Promise.all(started);
		},
	};
}

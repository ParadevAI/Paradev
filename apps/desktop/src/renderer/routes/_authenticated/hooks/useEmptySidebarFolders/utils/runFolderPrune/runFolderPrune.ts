import { errorMessage } from "@superset/i18n/errors";
import {
	type FindOrphanedTagFoldersInput,
	findOrphanedTagFolders,
	type OrphanedTagFolder,
	type UnverifiedTagFolder,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import type {
	EmptySidebarFolder,
	FailedSidebarFolder,
	FolderGroup,
	RemoveEmptySidebarFoldersResult,
	SkippedSidebarFolder,
} from "../../types";

/** What a prune reads from the window, as of its latest render. */
export interface FolderPruneSnapshot {
	organizationId: string | null;
	findInput: FindOrphanedTagFoldersInput;
	groupFolders: (folders: readonly OrphanedTagFolder[]) => FolderGroup[];
	toSkipped: (
		folders: readonly UnverifiedTagFolder[],
	) => SkippedSidebarFolder[];
	/** Null when a host that keeps the scope's settings cannot be reached. */
	resolveSettingHostUrls: (scope: string) => string[] | null;
}

export interface RunFolderPruneOptions {
	projectId?: string;
	dryRun: boolean;
	readLatest: () => FolderPruneSnapshot;
	/** Refetches stale sources and resolves to the input to decide from. */
	refresh: () => Promise<FindOrphanedTagFoldersInput>;
	deleteHostSetting: (url: string, scope: string, tag: string) => Promise<void>;
	/** Deletes stored rows from the collections of the organization the prune started in. */
	deleteRows: (sectionIds: readonly string[]) => void;
}

/**
 * Decides and removes empty folders for the organization the window shows
 * when the prune starts. The window can switch organization while sources
 * are refetched or hosts answer; the latest render then describes another
 * organization's folders and hosts, so from that point nothing more is
 * deleted and the rest is reported as skipped.
 */
export async function runFolderPrune({
	projectId,
	dryRun,
	readLatest,
	refresh,
	deleteHostSetting,
	deleteRows,
}: RunFolderPruneOptions): Promise<RemoveEmptySidebarFoldersResult> {
	const start = readLatest();
	const switched = () => readLatest().organizationId !== start.organizationId;
	const asSwitched = (folder: EmptySidebarFolder): SkippedSidebarFolder => ({
		...folder,
		reason: "organizationChanged",
	});

	const input = await refresh();
	if (switched()) {
		const found = findOrphanedTagFolders({
			...start.findInput,
			scope: projectId,
		});
		return {
			removed: [],
			skipped: [
				...start.groupFolders(found.orphaned).map(({ folder }) => folder),
				...start.toSkipped(found.unverified),
			].map(asSwitched),
			failed: [],
		};
	}

	const { groupFolders, resolveSettingHostUrls, toSkipped } = readLatest();
	const found = findOrphanedTagFolders({ ...input, scope: projectId });
	const skipped = toSkipped(found.unverified);
	const candidates: (FolderGroup & { urls: string[] })[] = [];
	for (const group of groupFolders(found.orphaned)) {
		const urls = resolveSettingHostUrls(group.folder.scope);
		if (urls) {
			candidates.push({ ...group, urls });
		} else {
			skipped.push({ ...group.folder, reason: "settingHostsUnknown" });
		}
	}
	if (dryRun) {
		return {
			removed: candidates.map(({ folder }) => folder),
			skipped,
			failed: [],
		};
	}

	const removed: EmptySidebarFolder[] = [];
	const failed: FailedSidebarFolder[] = [];
	for (const [index, { folder, sectionIds, urls }] of candidates.entries()) {
		if (switched()) {
			skipped.push(
				...candidates
					.slice(index)
					.map((candidate) => asSwitched(candidate.folder)),
			);
			break;
		}
		try {
			await Promise.all(
				urls.map((url) => deleteHostSetting(url, folder.scope, folder.tag)),
			);
		} catch (error) {
			failed.push({ ...folder, error: errorMessage(error) });
			continue;
		}
		if (switched()) {
			skipped.push(
				...candidates
					.slice(index)
					.map((candidate) => asSwitched(candidate.folder)),
			);
			break;
		}
		const latest = findOrphanedTagFolders({
			...readLatest().findInput,
			scope: folder.scope,
		});
		const nowUnverified = latest.unverified.find(
			(current) => current.tag === folder.tag,
		);
		if (nowUnverified) {
			skipped.push({ ...folder, reason: nowUnverified.reason });
			continue;
		}
		if (!latest.orphaned.some((current) => current.tag === folder.tag)) {
			continue;
		}
		deleteRows(sectionIds);
		removed.push(folder);
	}
	return { removed, skipped, failed };
}

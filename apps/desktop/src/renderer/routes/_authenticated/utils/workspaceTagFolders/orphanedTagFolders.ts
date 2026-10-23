import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	SESSIONS_TAG_SCOPE,
	tagFolderScope,
} from "@superset/shared/workspace-tags";
import type { TagFolderSectionInput } from "./workspaceTagFolders";

export interface OrphanCheckWorkspace {
	id: string;
	/**
	 * Undefined when the lane is not known yet (a cloud row with no placement
	 * row): its tags then keep the folder alive in every scope.
	 */
	projectId: string | null | undefined;
	tags?: readonly string[] | null;
}

/** One host's `workspace.list` read, as far as this window knows it. */
export interface TagFolderHostRead {
	isLocal: boolean;
	/** True only when the host answered in this session: not an error, a snapshot, or offline. */
	live: boolean;
	/** Projects the host serves, live or last seen; null when nothing is known. */
	projectIds: readonly string[] | null;
}

export interface FindOrphanedTagFoldersInput {
	sections: readonly Pick<
		TagFolderSectionInput,
		"sectionId" | "projectId" | "name" | "tag"
	>[];
	/** Every workspace on every host and in the cloud, before any sidebar filter. */
	workspaces: readonly OrphanCheckWorkspace[];
	hostReads: readonly TagFolderHostRead[];
	/** The org's host list came from the cloud in this session. */
	rosterLive: boolean;
	/** The cloud list answered in this session, or cloud workspaces do not apply. */
	cloudLive: boolean;
	hiddenTagsByProject: ReadonlyMap<string, ReadonlySet<string>>;
	/** Only consider this scope (a project id, or the Sessions scope). */
	scope?: string;
}

export interface OrphanedTagFolder {
	sectionId: string;
	scope: string;
	tag: string;
	name: string;
}

export interface OrphanedTagFolders {
	/** Stored rows whose tag no workspace in the scope carries, where every source answered. */
	orphaned: OrphanedTagFolder[];
	/** Rows that look the same, but in a scope some source has not answered for. */
	unverified: OrphanedTagFolder[];
}

/**
 * Stored folder rows that only presentation keeps alive. A tag-backed row is
 * orphaned when no workspace in its scope carries the tag — zero resolved
 * members is not enough, because a workspace tagged `a` and `b` renders in
 * one folder only. Legacy rows (no tag) own members through local pointers
 * and are never listed; hidden folders are not shown, so they are not listed
 * either.
 */
export function findOrphanedTagFolders(
	input: FindOrphanedTagFoldersInput,
): OrphanedTagFolders {
	const carriedByScope = new Map<string, Set<string>>();
	const carriedInEveryScope = new Set<string>();
	for (const workspace of input.workspaces) {
		const tags = normalizeWorkspaceTags(workspace.tags);
		if (workspace.projectId === undefined) {
			for (const tag of tags) carriedInEveryScope.add(tag);
			continue;
		}
		const scope = tagFolderScope(workspace.projectId);
		let carried = carriedByScope.get(scope);
		if (!carried) {
			carried = new Set();
			carriedByScope.set(scope, carried);
		}
		for (const tag of tags) carried.add(tag);
	}

	const everyScopeUnverified =
		!input.rosterLive ||
		!input.cloudLive ||
		!input.hostReads.some((read) => read.isLocal && read.live) ||
		input.hostReads.some((read) => !read.live && read.projectIds === null);
	const unverifiedScopes = new Set<string>();
	for (const read of input.hostReads) {
		if (read.live) continue;
		unverifiedScopes.add(SESSIONS_TAG_SCOPE);
		for (const projectId of read.projectIds ?? []) {
			unverifiedScopes.add(projectId);
		}
	}

	const result: OrphanedTagFolders = { orphaned: [], unverified: [] };
	for (const section of input.sections) {
		const scope = section.projectId;
		if (input.scope !== undefined && scope !== input.scope) continue;
		const tag = normalizeWorkspaceTag(section.tag);
		if (tag == null) continue;
		if (input.hiddenTagsByProject.get(scope)?.has(tag)) continue;
		if (carriedInEveryScope.has(tag)) continue;
		if (carriedByScope.get(scope)?.has(tag)) continue;
		const folder = {
			sectionId: section.sectionId,
			scope,
			tag,
			name: section.name,
		};
		if (everyScopeUnverified || unverifiedScopes.has(scope)) {
			result.unverified.push(folder);
		} else {
			result.orphaned.push(folder);
		}
	}
	return result;
}

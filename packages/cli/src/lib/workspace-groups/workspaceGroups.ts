import { CLIError } from "@superset/cli-framework";
import {
	mintFolderTag,
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	tagFolderScope,
} from "@superset/shared/workspace-tags";
import type { HostServiceClient } from "../host-target";
import type { HostWorkspaceRow } from "../host-workspaces";

export interface GroupSetting {
	scope: string;
	tag: string;
	displayName: string | null;
}

export interface GroupedWorkspace {
	projectId: string | null;
	tags?: readonly string[] | null;
}

export interface GroupContext {
	workspaces: HostWorkspaceRow[];
	settings: GroupSetting[];
}

function isMissingTagFolders(error: unknown): boolean {
	return (
		error instanceof Error &&
		/No procedure found on path "?tagFolders\./.test(error.message)
	);
}

function shownGroupName(
	tag: string,
	displayName: string | null | undefined,
): string {
	return displayName?.trim() || tag;
}

function isSameGroupName(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** The caller's group names on a host; none on a host older than tag folders. */
export async function listGroupSettings(
	client: HostServiceClient,
): Promise<GroupSetting[]> {
	try {
		return await client.tagFolders.list.query();
	} catch (error) {
		if (isMissingTagFolders(error)) return [];
		throw error;
	}
}

export async function loadGroupContext(
	client: HostServiceClient,
): Promise<GroupContext> {
	const [workspaces, settings] = await Promise.all([
		client.workspace.list.query(),
		listGroupSettings(client),
	]);
	return { workspaces, settings };
}

/** The name the desktop shows for each of a workspace's groups. */
export function workspaceGroupNames(
	workspace: GroupedWorkspace,
	settings: readonly GroupSetting[],
): string[] {
	const scope = tagFolderScope(workspace.projectId);
	return normalizeWorkspaceTags(workspace.tags).map((tag) =>
		shownGroupName(
			tag,
			settings.find(
				(setting) =>
					setting.scope === scope && normalizeWorkspaceTag(setting.tag) === tag,
			)?.displayName,
		),
	);
}

export function isInGroup(
	workspace: GroupedWorkspace,
	settings: readonly GroupSetting[],
	name: string,
): boolean {
	return workspaceGroupNames(workspace, settings).some((shown) =>
		isSameGroupName(shown, name),
	);
}

/**
 * The tag of the group shown as `name` in `scope`. A desktop rename changes
 * only the shown name, so a group's tag can differ from its name.
 */
export function resolveGroupTag(args: {
	name: string;
	scope: string;
	workspaces: readonly GroupedWorkspace[];
	settings: readonly GroupSetting[];
}): { tag: string; isNew: boolean } {
	const shownNameByTag = new Map<string, string>();
	for (const workspace of args.workspaces) {
		if (tagFolderScope(workspace.projectId) !== args.scope) continue;
		for (const tag of normalizeWorkspaceTags(workspace.tags)) {
			shownNameByTag.set(tag, tag);
		}
	}
	for (const setting of args.settings) {
		const tag = normalizeWorkspaceTag(setting.tag);
		if (setting.scope !== args.scope || tag == null) continue;
		shownNameByTag.set(tag, shownGroupName(tag, setting.displayName));
	}

	const matches = [...shownNameByTag]
		.filter(([, shown]) => isSameGroupName(shown, args.name))
		.map(([tag]) => tag);
	if (matches.length > 1) {
		throw new CLIError(
			`Several groups are named "${args.name.trim()}"`,
			`Pass --tag with one of their tags: ${matches.map((tag) => `"${tag}"`).join(", ")}`,
		);
	}
	const [match] = matches;
	if (match !== undefined) return { tag: match, isNew: false };
	return { tag: mintFolderTag(args.name, shownNameByTag.keys()), isNew: true };
}

/**
 * The tag that files a workspace into the group shown as `name`. A new group
 * keeps `name` as typed for its shown name, as a group made in the desktop does.
 */
export async function claimGroupTag(
	client: HostServiceClient,
	context: GroupContext,
	args: { name: string; scope: string },
): Promise<string> {
	const shownName = args.name.trim();
	if (!shownName) {
		throw new CLIError(
			"--group needs a name",
			"Pass the group name the desktop shows, e.g. --group Review",
		);
	}
	const { tag, isNew } = resolveGroupTag({
		name: shownName,
		scope: args.scope,
		workspaces: context.workspaces,
		settings: context.settings,
	});
	if (isNew && shownName !== tag) {
		try {
			await client.tagFolders.upsert.mutate({
				scope: args.scope,
				tag,
				displayName: shownName,
			});
		} catch (error) {
			if (!isMissingTagFolders(error)) throw error;
		}
	}
	return tag;
}

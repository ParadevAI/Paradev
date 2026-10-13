import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
	SESSIONS_TAG_SCOPE,
	tagFolderScope,
	WORKSPACE_TAG_MAX_LENGTH,
} from "@superset/shared/workspace-tags";

/**
 * A sidebar folder IS a tag: the folder exists because some workspace in the
 * project carries the tag, and membership is the tag itself. Local section
 * rows are presentation only (color, order, collapse) and appear only once
 * someone customises a folder. Every pass that decides "which container does
 * this workspace render in" — the project-tree builder, the top-level lane,
 * the flatten pass — must go through this module; the moment two of them
 * derive membership independently they disagree.
 */

/**
 * Synthetic tabOrder floor for folders that exist only because a tag does
 * (no local presentation row). Far above any user-assigned order, so derived
 * folders always render at the bottom of a project lane, deterministically.
 * Callers that renumber stored rows must never feed these back into
 * `getNextTabOrder`-style math.
 */
export const DERIVED_TAG_FOLDER_TAB_ORDER_BASE = 2 ** 31;

/**
 * A folder tag with this separator is a sub-folder: `features/auth` renders
 * inside `features`. Any actor that can tag can nest — `--tag features/auth`
 * from the CLI files the workspace two levels deep, and the parent folder
 * exists because its child does.
 */
export const FOLDER_TAG_PATH_SEPARATOR = "/";

/** Levels the sidebar offers to create (top level included). */
export const MAX_FOLDER_DEPTH = 3;

export interface TagFolderRef {
	sectionId: string;
	projectId: string;
	tag: string;
	tabOrder: number;
}

/**
 * The stored presentation row shape this module reads. `tag` is optional on
 * purpose: rows persisted before the field existed carry it ABSENT (i.e.
 * `undefined`, not `null`) — every read below guards with `== null`.
 */
export interface TagFolderSectionInput {
	sectionId: string;
	projectId: string;
	name: string;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
	createdAt: Date;
	/** Null (or absent) = legacy folder that owns members via `sectionId`. */
	tag?: string | null;
}

/**
 * The host-workspace shape this module reads. `tags` is optional because a
 * row served by an older host (or restored from an old snapshot) carries the
 * field absent.
 */
export interface TagFolderWorkspaceInput {
	id: string;
	/**
	 * Null for project-less "session" workspaces; their folders are keyed by
	 * SESSIONS_TAG_SCOPE (see the shared `tagFolderScope`).
	 */
	projectId: string | null;
	tags?: readonly string[] | null;
}

/** One tag folder's host-side presentation (`tag_folder_settings`). */
export interface TagFolderSettingInput {
	projectId: string;
	tag: string;
	displayName?: string | null;
	color?: string | null;
	tabOrder?: number | null;
}

/**
 * Cross-cutting presentation context for the union: host-local settings
 * (display name, color, order) and the per-project hidden-tag list (a hidden
 * folder leaves the union entirely —
 * members render top-level — without touching anyone's tags). REQUIRED so
 * every membership pass applies the same view; two passes disagreeing on
 * hidden is the same bug class as two membership derivations.
 */
export interface TagFolderContext {
	tagSettings: readonly TagFolderSettingInput[];
	hiddenTagsByProject: ReadonlyMap<string, ReadonlySet<string>>;
}

export const EMPTY_TAG_FOLDER_CONTEXT: TagFolderContext = {
	tagSettings: [],
	hiddenTagsByProject: new Map(),
};

export interface TagFolderSection extends TagFolderSectionInput {
	tag: string | null;
	/** True when no stored presentation row exists — the tag alone made it. */
	isDerived: boolean;
	/** Folder key of the enclosing folder; null at the top of the lane. */
	parentId: string | null;
}

/**
 * The path segments of a folder tag. A tag only nests when every segment is
 * non-empty and untrimmed-equal: `a//b`, `/a` or `a / b` stay flat folders,
 * because their "parent" could never match a normalized tag.
 */
export function getFolderTagPath(tag: string): string[] {
	const segments = tag.split(FOLDER_TAG_PATH_SEPARATOR);
	if (segments.length === 1) return segments;
	const isNestable = segments.every(
		(segment) => segment.length > 0 && segment.trim() === segment,
	);
	return isNestable ? segments : [tag];
}

export function getParentFolderTag(tag: string): string | null {
	const path = getFolderTagPath(tag);
	return path.length > 1
		? path.slice(0, -1).join(FOLDER_TAG_PATH_SEPARATOR)
		: null;
}

/** The last path segment: what a folder is called when nobody named it. */
export function getFolderTagLeaf(tag: string): string {
	return getFolderTagPath(tag).at(-1) ?? tag;
}

/** The tag and every ancestor tag, outermost first. */
function getFolderTagLineage(tag: string): string[] {
	const path = getFolderTagPath(tag);
	return path.map((_, index) =>
		path.slice(0, index + 1).join(FOLDER_TAG_PATH_SEPARATOR),
	);
}

export function isFolderTagWithin(tag: string, ancestorTag: string): boolean {
	return getFolderTagLineage(tag).includes(ancestorTag);
}

/** Shortest leaf plus a collision suffix that must still fit under a parent. */
const MIN_SUB_FOLDER_LEAF_LENGTH = 4;

/**
 * Whether the sidebar may create a sub-folder under `parentTag`: within
 * {@link MAX_FOLDER_DEPTH} and with room left for a leaf in the tag cap.
 */
export function canCreateSubFolder(parentTag: string | null): boolean {
	if (parentTag == null) return false;
	const path = getFolderTagPath(parentTag);
	const leafBudget =
		WORKSPACE_TAG_MAX_LENGTH -
		parentTag.length -
		FOLDER_TAG_PATH_SEPARATOR.length;
	return (
		path.length < MAX_FOLDER_DEPTH && leafBudget >= MIN_SUB_FOLDER_LEAF_LENGTH
	);
}

export interface SessionTagFolder {
	tag: string;
	name: string;
	color: string | null;
}

/**
 * The project-less Sessions folders, with host presentation applied. Keeping
 * this beside `deriveTagFolders` gives the sidebar and move menus one rule for
 * names, colours, normalization, and scope isolation.
 */
export function deriveSessionTagFolders(
	workspaces: readonly TagFolderWorkspaceInput[],
	settings: readonly TagFolderSettingInput[],
): SessionTagFolder[] {
	const settingsByTag = new Map(
		settings.flatMap((setting) => {
			if (setting.projectId !== SESSIONS_TAG_SCOPE) return [];
			const tag = normalizeWorkspaceTag(setting.tag);
			return tag == null ? [] : [[tag, setting] as const];
		}),
	);
	const tags = new Set<string>();
	for (const workspace of workspaces) {
		if (workspace.projectId !== null) continue;
		for (const tag of normalizeWorkspaceTags(workspace.tags)) tags.add(tag);
	}
	return [...tags].sort().map((tag) => {
		const setting = settingsByTag.get(tag);
		return {
			tag,
			name: setting?.displayName ?? tag,
			color: setting?.color ?? null,
		};
	});
}

/** `${projectId}:${tag}` — addressable without a stored row; the tag is
 * recoverable from the key alone. `tag` must already be normalized. */
/**
 * Inverse of the shared `tagFolderScope`: the projectId the lane's workspace
 * rows carry (null for the Sessions lane). Folder rows and host tag settings
 * are keyed by the scope; workspaces never are.
 */
export function laneProjectIdForScope(scope: string): string | null {
	return scope === SESSIONS_TAG_SCOPE ? null : scope;
}

export function buildSidebarFolderKey(projectId: string, tag: string): string {
	return `${projectId}:${tag}`;
}

/**
 * Inverse of {@link buildSidebarFolderKey}. Returns null for legacy uuid
 * section ids (no colon), null/undefined input, and keys whose tag half
 * doesn't normalize to a valid tag. Project ids are uuids and never contain
 * a colon, so the first colon is the split point (tags may contain colons).
 */
export function parseSidebarFolderKey(
	sectionId: string | null | undefined,
): { projectId: string; tag: string } | null {
	if (sectionId == null) return null;
	const separatorIndex = sectionId.indexOf(":");
	if (separatorIndex <= 0) return null;
	const projectId = sectionId.slice(0, separatorIndex);
	const tag = normalizeWorkspaceTag(sectionId.slice(separatorIndex + 1));
	if (tag == null) return null;
	return { projectId, tag };
}

/**
 * Union of stored presentation rows and tag-only folders. A folder exists
 * for every (project, tag) some workspace carries; a stored row only adds
 * presentation. Derived folders are appended per project in tag order at
 * {@link DERIVED_TAG_FOLDER_TAB_ORDER_BASE}, and every ancestor of a nested
 * tag exists too, so a sub-folder always has its parent.
 */
export function deriveTagFolders(
	sections: readonly TagFolderSectionInput[],
	workspaces: readonly TagFolderWorkspaceInput[],
	context: TagFolderContext,
): TagFolderSection[] {
	const settingsByKey = new Map<string, TagFolderSettingInput>();
	for (const setting of context.tagSettings) {
		const tag = normalizeWorkspaceTag(setting.tag);
		if (tag == null) continue;
		settingsByKey.set(`${setting.projectId}\u0000${tag}`, setting);
	}
	// Order interleaves with device-local workspace positions. Host order is
	// only the default until this device materializes a presentation row.
	const applySettings = (folder: TagFolderSection): TagFolderSection => {
		if (folder.tag == null) return folder;
		const setting = settingsByKey.get(`${folder.projectId}\u0000${folder.tag}`);
		if (!setting) return folder;
		return {
			...folder,
			name: setting.displayName ?? folder.name,
			color: setting.color ?? folder.color,
			tabOrder: folder.isDerived
				? (setting.tabOrder ?? folder.tabOrder)
				: folder.tabOrder,
		};
	};
	const isHidden = (folder: TagFolderSection): boolean => {
		if (folder.tag == null) return false;
		const hiddenTags = context.hiddenTagsByProject.get(folder.projectId);
		if (!hiddenTags) return false;
		// Hiding a folder hides its sub-folders with it.
		return getFolderTagLineage(folder.tag).some((tag) => hiddenTags.has(tag));
	};
	const withParent = (folder: TagFolderSection): TagFolderSection => {
		const parentTag =
			folder.tag == null ? null : getParentFolderTag(folder.tag);
		return {
			...folder,
			parentId:
				parentTag == null
					? null
					: buildSidebarFolderKey(folder.projectId, parentTag),
		};
	};

	const result: TagFolderSection[] = sections.map((section) => ({
		...section,
		tag: normalizeWorkspaceTag(section.tag),
		isDerived: false,
		parentId: null,
	}));

	// Tags already covered by a stored row, per project.
	const coveredTagsByProjectId = new Map<string, Set<string>>();
	for (const section of result) {
		if (section.tag == null) continue;
		let covered = coveredTagsByProjectId.get(section.projectId);
		if (!covered) {
			covered = new Set();
			coveredTagsByProjectId.set(section.projectId, covered);
		}
		covered.add(section.tag);
	}

	const uncoveredTagsByProjectId = new Map<string, Set<string>>();
	const addUncovered = (scope: string, tag: string) => {
		// A sub-folder needs its whole lineage on screen, so every ancestor
		// of a carried or stored tag exists too.
		for (const lineageTag of getFolderTagLineage(tag)) {
			if (coveredTagsByProjectId.get(scope)?.has(lineageTag)) continue;
			let uncovered = uncoveredTagsByProjectId.get(scope);
			if (!uncovered) {
				uncovered = new Set();
				uncoveredTagsByProjectId.set(scope, uncovered);
			}
			uncovered.add(lineageTag);
		}
	};
	for (const section of result) {
		if (section.tag != null) addUncovered(section.projectId, section.tag);
	}
	for (const workspace of workspaces) {
		const scope = tagFolderScope(workspace.projectId);
		for (const tag of normalizeWorkspaceTags(workspace.tags)) {
			addUncovered(scope, tag);
		}
	}

	for (const [projectId, tags] of uncoveredTagsByProjectId) {
		[...tags].sort().forEach((tag, index) => {
			result.push({
				sectionId: buildSidebarFolderKey(projectId, tag),
				projectId,
				name: getFolderTagLeaf(tag),
				tag,
				tabOrder: DERIVED_TAG_FOLDER_TAB_ORDER_BASE + index,
				isCollapsed: false,
				color: null,
				createdAt: new Date(0),
				isDerived: true,
				parentId: null,
			});
		});
	}

	return result
		.map(applySettings)
		.map(withParent)
		.filter((folder) => !isHidden(folder));
}

/**
 * Pre-order walk of a folder forest: each folder is followed by its
 * sub-folders, siblings by `compare`. A folder whose parent is absent from
 * the input (hidden, or not loaded yet) is treated as a root, so nothing
 * ever disappears because its parent did.
 */
export function orderFolderTree<
	Folder extends { id: string; parentId?: string | null },
>(
	folders: readonly Folder[],
	compare: (left: Folder, right: Folder) => number,
): Array<{ folder: Folder; depth: number }> {
	const ids = new Set(folders.map((folder) => folder.id));
	const childrenByParentId = new Map<string | null, Folder[]>();
	for (const folder of folders) {
		const parentId =
			folder.parentId != null && ids.has(folder.parentId)
				? folder.parentId
				: null;
		const siblings = childrenByParentId.get(parentId);
		if (siblings) siblings.push(folder);
		else childrenByParentId.set(parentId, [folder]);
	}
	const ordered: Array<{ folder: Folder; depth: number }> = [];
	const visit = (parentId: string | null, depth: number) => {
		const children = childrenByParentId.get(parentId);
		if (!children) return;
		for (const folder of [...children].sort(compare)) {
			ordered.push({ folder, depth });
			visit(folder.id, depth + 1);
		}
	};
	visit(null, 0);
	return ordered;
}

/**
 * tag → folder for one project, over the derived union from
 * {@link deriveTagFolders} (stored-only input misses tag-only folders).
 * Duplicate tags keep the lowest tabOrder.
 */
export function getProjectFolderTagIndex(
	sections: readonly Pick<
		TagFolderSectionInput,
		"sectionId" | "projectId" | "tabOrder" | "tag"
	>[],
	projectId: string,
): Map<string, TagFolderRef> {
	const index = new Map<string, TagFolderRef>();
	for (const section of sections) {
		if (section.projectId !== projectId) continue;
		const tag = normalizeWorkspaceTag(section.tag);
		if (tag == null) continue;
		const existing = index.get(tag);
		if (existing && existing.tabOrder <= section.tabOrder) continue;
		index.set(tag, {
			sectionId: section.sectionId,
			projectId: section.projectId,
			tag,
			tabOrder: section.tabOrder,
		});
	}
	return index;
}

/**
 * The one container a workspace's tags place it in, or null. A workspace
 * renders in exactly one container — ordering, DnD, selection and keyboard
 * nav all assume it — so a folder loses to its own sub-folder, and other
 * ties resolve to the lowest tabOrder, then the lexicographically smallest
 * tag.
 */
export function resolveWorkspaceFolder(
	tags: readonly string[] | null | undefined,
	index: ReadonlyMap<string, TagFolderRef>,
): TagFolderRef | null {
	const folderTags = normalizeWorkspaceTags(tags).filter((tag) =>
		index.has(tag),
	);
	let winner: TagFolderRef | null = null;
	for (const tag of folderTags) {
		const ref = index.get(tag);
		if (!ref) continue;
		// `features` and `features/auth` together mean the deeper folder.
		const isAncestorOfAnother = folderTags.some(
			(other) => other !== tag && isFolderTagWithin(other, tag),
		);
		if (isAncestorOfAnother) continue;
		if (
			!winner ||
			ref.tabOrder < winner.tabOrder ||
			(ref.tabOrder === winner.tabOrder && ref.tag < winner.tag)
		) {
			winner = ref;
		}
	}
	return winner;
}

/**
 * The shared membership resolver: tag-resolved folder first; otherwise the
 * local `sectionId` — but only when it points at a legacy (non-tag-keyed)
 * row. A tag-backed folder owns membership via tags alone, so a stale local
 * pointer at one must never capture the workspace (§6 of the design doc:
 * migration only sets a tag after every member is tagged, so a live tag
 * always beats a stale pointer).
 */
export function resolveWorkspaceSectionId(args: {
	tags: readonly string[] | null | undefined;
	localSectionId: string | null | undefined;
	index: ReadonlyMap<string, TagFolderRef>;
}): string | null {
	const folder = resolveWorkspaceFolder(args.tags, args.index);
	if (folder) return folder.sectionId;
	if (args.localSectionId == null) return null;
	if (parseSidebarFolderKey(args.localSectionId) != null) return null;
	return args.localSectionId;
}

/**
 * Mint a tag for a folder from its display name: normalize (trim+lowercase —
 * tags allow spaces, no further slugging), fall back to "group" for a name
 * that can't be a tag, and suffix `-2`, `-3`, … while the tag is taken. A
 * `/` in the name would nest the folder, so it becomes `-`; a `parentTag`
 * mints the folder as that folder's child.
 */
export function mintFolderTag(
	name: string | null | undefined,
	takenTags: Iterable<string>,
	parentTag: string | null = null,
): string {
	const taken = new Set<string>();
	for (const tag of takenTags) {
		const normalized = normalizeWorkspaceTag(tag);
		if (normalized != null) taken.add(normalized);
	}
	const prefix =
		parentTag == null ? "" : `${parentTag}${FOLDER_TAG_PATH_SEPARATOR}`;
	const leafBudget = WORKSPACE_TAG_MAX_LENGTH - prefix.length;
	const flatName = name?.replaceAll(FOLDER_TAG_PATH_SEPARATOR, "-");
	const leaf =
		(parentTag == null
			? normalizeWorkspaceTag(flatName)
			: normalizeWorkspaceTag(flatName?.trim().slice(0, leafBudget))) ??
		"group";
	const base = `${prefix}${leaf}`;
	if (!taken.has(base)) return base;
	let counter = 2;
	for (;;) {
		const suffix = `-${counter}`;
		// Trim the leaf so the suffixed tag stays within the length cap —
		// the host rejects (never trims) over-length tags.
		const candidate =
			prefix + leaf.slice(0, leafBudget - suffix.length).trimEnd() + suffix;
		if (!taken.has(candidate)) return candidate;
		counter += 1;
	}
}

/**
 * Retarget a workspace's tags from one folder to another, touching ONLY tags
 * the project has a folder for. `folderTags` is the project's folder tag set
 * (the keys of {@link getProjectFolderTagIndex}); anything outside it — an
 * agent's `--tag scratch` in a project with no scratch folder — survives.
 * `nextTag` null strips folder membership (ungroup).
 */
export function applyFolderTagChange(
	currentTags: readonly string[] | null | undefined,
	folderTags: Iterable<string>,
	nextTag: string | null,
): string[] {
	const folderTagSet = new Set<string>();
	for (const tag of folderTags) {
		const normalized = normalizeWorkspaceTag(tag);
		if (normalized != null) folderTagSet.add(normalized);
	}
	const kept = normalizeWorkspaceTags(currentTags).filter(
		(tag) => !folderTagSet.has(tag),
	);
	const next = normalizeWorkspaceTag(nextTag);
	if (next != null) kept.push(next);
	return normalizeWorkspaceTags(kept);
}

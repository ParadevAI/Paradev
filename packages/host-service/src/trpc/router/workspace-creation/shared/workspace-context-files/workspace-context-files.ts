import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmdirSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../../../db";
import { projects, workspaces } from "../../../../../db/schema";
import { listWorkspaceCheckouts } from "../../../../../workspaces/checkouts";

export const WORKSPACE_CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

/** Each agent folder whose `skills/` the root links per repository. */
export const WORKSPACE_SKILL_FOLDERS = [".agents", ".claude"] as const;

/**
 * Agent config the root links from the primary repository. Never
 * `.claude/settings.local.json`: Claude Code keeps the root's approvals there.
 */
export const WORKSPACE_CONFIG_LINKS = [
	{ path: ".mcp.json", type: "file" },
	{ path: ".claude/settings.json", type: "file" },
	{ path: ".codex/config.toml", type: "file" },
	{ path: ".cursor/mcp.json", type: "file" },
	{ path: ".cursor/rules", type: "dir" },
] as const;

const AGENT_FOLDERS = [".agents", ".claude", ".codex", ".cursor"] as const;

/** Top-level root entries the host makes, besides the checkout folders. */
export const WORKSPACE_ROOT_ENTRIES = [
	...WORKSPACE_CONTEXT_FILES,
	".mcp.json",
	...AGENT_FOLDERS,
] as const;

const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export interface ContextCheckout {
	name: string;
	path: string;
	branch: string;
	isPrimary: boolean;
}

/**
 * Tells agents started in a multi-repo workspace where each repository is,
 * and links each repository's skills into the root, where agents look.
 */
export function writeWorkspaceContextFiles(
	root: string,
	checkouts: ContextCheckout[],
): void {
	const ordered = [...checkouts].sort(
		(a, b) => Number(b.isPrimary) - Number(a.isPrimary),
	);
	for (const folder of WORKSPACE_SKILL_FOLDERS) {
		try {
			syncSkillLinks(root, folder, ordered);
		} catch (err) {
			console.warn(
				`[workspace-context-files] could not link ${folder}/skills in ${root}`,
				err,
			);
		}
	}
	const primary = checkouts.find((checkout) => checkout.isPrimary);
	const linked = syncConfigLinks(
		root,
		primary,
		checkouts.map((checkout) => checkout.path),
	);
	writeIfChanged(
		join(root, "AGENTS.md"),
		renderAgentsFile(checkouts, linked.length > 0 ? primary : undefined),
	);
	writeIfChanged(join(root, "CLAUDE.md"), "@AGENTS.md\n");
}

function tableCell(value: string): string {
	return value.replaceAll("|", "\\|");
}

function renderAgentsFile(
	checkouts: ContextCheckout[],
	configSource: ContextCheckout | undefined,
): string {
	const lines = [
		"# Workspace",
		"",
		"This folder is a multi-repository workspace. It is not a git repository itself.",
		"Each repository below is its own git checkout. Run git commands inside the",
		"repository you mean, and expect a change to span several repositories.",
		"",
		"| Repository | Path | Branch |",
		"| --- | --- | --- |",
		...checkouts.map(
			(checkout) =>
				`| ${tableCell(checkout.name)} | ${tableCell(checkout.path)} | ${tableCell(checkout.branch)} |`,
		),
		"",
		"## Repository instructions",
		"",
		"The instruction files of the repositories are not loaded for you. Before you",
		"work in a repository, read the files listed for it. Folders inside a",
		"repository can have their own AGENTS.md or CLAUDE.md: read those before you",
		"work in that folder.",
		"",
		...checkouts.map((checkout) => {
			const files = INSTRUCTION_FILES.filter((file) =>
				existsSync(join(checkout.path, file)),
			).map((file) => join(checkout.path, file));
			return `- ${checkout.name}: ${files.length > 0 ? files.join(", ") : "no AGENTS.md or CLAUDE.md at its root"}`;
		}),
		"",
		...(configSource
			? [
					"## MCP servers and settings",
					"",
					`MCP servers and settings come from the primary repository (${configSource.name}).`,
					"They run with this workspace folder as the working folder, so a relative",
					"path in them resolves from this folder, not from the repository.",
					"",
				]
			: []),
	];
	return lines.join("\n");
}

/** Rewrites the context files of a live multi-repo workspace from its checkouts. */
export function syncWorkspaceContextFiles(
	db: HostDb,
	workspaceId: string,
): void {
	try {
		const workspace = db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (!workspace?.projectId || workspace.archivedAt !== null) return;
		const checkouts = listWorkspaceCheckouts(db, workspace);
		if (checkouts.length < 2 || !existsSync(workspace.worktreePath)) return;
		const project = db
			.select({ primaryRepositoryId: projects.primaryRepositoryId })
			.from(projects)
			.where(eq(projects.id, workspace.projectId))
			.get();
		writeWorkspaceContextFiles(
			workspace.worktreePath,
			checkouts.map((checkout) => ({
				name: checkout.repository.name,
				path: checkout.path,
				branch: checkout.row.branch,
				isPrimary: checkout.repository.id === project?.primaryRepositoryId,
			})),
		);
	} catch (err) {
		console.warn("[workspace-context-files] could not update", {
			workspaceId,
			err,
		});
	}
}

/** Removes the generated files and skill links, and their folders once empty. */
export function removeWorkspaceContextFiles(
	root: string,
	checkoutPaths: string[],
): void {
	for (const file of WORKSPACE_CONTEXT_FILES) {
		removeFile(join(root, file));
	}
	syncConfigLinks(root, undefined, checkoutPaths);
	for (const folder of WORKSPACE_SKILL_FOLDERS) {
		const skills = join(root, folder, "skills");
		if (!isRealFolderPath(root, skills)) continue;
		try {
			for (const name of listRealFolder(skills) ?? []) {
				const link = join(skills, name);
				if (isLinkIntoCheckouts(link, checkoutPaths)) unlinkSync(link);
			}
			removeIfEmpty(skills);
			removeIfEmpty(join(root, folder));
		} catch (err) {
			console.warn(
				`[workspace-context-files] could not remove ${folder}/skills links in ${root}`,
				err,
			);
		}
	}
}

/**
 * What a user or agent put at `.mcp.json` or in the root's agent folders, as
 * root-relative paths; the host's own links are not listed.
 */
export function listAgentFolderLeftovers(
	root: string,
	checkoutPaths: string[],
): string[] {
	const configLinks = new Set<string>(
		WORKSPACE_CONFIG_LINKS.map((link) => link.path),
	);
	const skillFolders = new Set<string>(WORKSPACE_SKILL_FOLDERS);
	const leftovers: string[] = [];
	const mcp = join(root, ".mcp.json");
	if (isPresent(mcp) && !isLinkIntoCheckouts(mcp, checkoutPaths)) {
		leftovers.push(".mcp.json");
	}
	for (const folder of AGENT_FOLDERS) {
		const path = join(root, folder);
		if (!isPresent(path)) continue;
		const entries = listRealFolder(path);
		if (!entries) {
			leftovers.push(folder);
			continue;
		}
		for (const entry of entries) {
			const entryPath = `${folder}/${entry}`;
			if (configLinks.has(entryPath)) {
				if (!isLinkIntoCheckouts(join(path, entry), checkoutPaths)) {
					leftovers.push(entryPath);
				}
				continue;
			}
			if (entry !== "skills" || !skillFolders.has(folder)) {
				leftovers.push(entryPath);
				continue;
			}
			const skills = join(path, "skills");
			const names = listRealFolder(skills);
			if (!names) {
				leftovers.push(`${folder}/skills`);
				continue;
			}
			for (const name of names) {
				if (!isLinkIntoCheckouts(join(skills, name), checkoutPaths)) {
					leftovers.push(`${folder}/skills/${name}`);
				}
			}
		}
	}
	return leftovers;
}

function syncSkillLinks(
	root: string,
	folder: (typeof WORKSPACE_SKILL_FOLDERS)[number],
	checkouts: ContextCheckout[],
): void {
	const wanted = new Map<string, string>();
	const ownerOf = new Map<string, string>();
	for (const checkout of checkouts) {
		const source = join(checkout.path, folder, "skills");
		for (const name of listSkillNames(source)) {
			const owner = ownerOf.get(name);
			if (owner !== undefined) {
				console.warn(
					`[workspace-context-files] skipped ${folder}/skills/${name} of ${checkout.name}: ${owner} has a skill of that name`,
				);
				continue;
			}
			ownerOf.set(name, checkout.name);
			wanted.set(name, join(source, name));
		}
	}

	const skills = join(root, folder, "skills");
	if (!isRealFolderPath(root, skills)) {
		console.warn(
			`[workspace-context-files] skipped skill links: ${folder}/skills in ${root} is not a folder`,
		);
		return;
	}
	const checkoutPaths = checkouts.map((checkout) => checkout.path);
	for (const name of listRealFolder(skills) ?? []) {
		const link = join(skills, name);
		const target = wanted.get(name);
		if (!isLinkIntoCheckouts(link, checkoutPaths)) {
			if (target !== undefined) {
				console.warn(
					`[workspace-context-files] skipped ${folder}/skills/${name}: a file the host did not make is there`,
				);
				wanted.delete(name);
			}
			continue;
		}
		if (target !== undefined && linkTarget(link) === target) {
			wanted.delete(name);
			continue;
		}
		unlinkSync(link);
	}

	if (wanted.size > 0) {
		mkdirSync(skills, { recursive: true });
		for (const [name, target] of wanted) {
			symlinkSync(relative(skills, target), join(skills, name), "dir");
		}
	}
	removeIfEmpty(skills);
	removeIfEmpty(join(root, folder));
}

/**
 * Links the primary repository's agent config at the root and reaps the
 * host's links that no longer match. Returns the root-relative paths linked.
 */
function syncConfigLinks(
	root: string,
	primary: ContextCheckout | undefined,
	checkoutPaths: string[],
): string[] {
	const linked: string[] = [];
	for (const { path, type } of WORKSPACE_CONFIG_LINKS) {
		const link = join(root, path);
		const folder = dirname(link);
		const target = primary ? join(primary.path, path) : undefined;
		const wanted = target !== undefined && isEntryOfType(target, type);
		try {
			if (!isRealFolderPath(root, folder)) {
				if (wanted) {
					console.warn(
						`[workspace-context-files] skipped ${path}: ${relative(root, folder)} in ${root} is not a folder`,
					);
				}
				continue;
			}
			if (isPresent(link)) {
				if (!isLinkIntoCheckouts(link, checkoutPaths)) {
					if (wanted) {
						console.warn(
							`[workspace-context-files] skipped ${path}: a file the host did not make is there`,
						);
					}
					continue;
				}
				if (wanted && linkTarget(link) === target) {
					linked.push(path);
					continue;
				}
				unlinkSync(link);
			}
			if (wanted) {
				mkdirSync(folder, { recursive: true });
				symlinkSync(relative(folder, target), link, type);
				linked.push(path);
			} else if (folder !== root) {
				removeIfEmpty(folder);
			}
		} catch (err) {
			console.warn(
				`[workspace-context-files] could not link ${path} in ${root}`,
				err,
			);
		}
	}
	return linked;
}

function isEntryOfType(path: string, type: "file" | "dir"): boolean {
	try {
		const stats = statSync(path);
		return type === "dir" ? stats.isDirectory() : stats.isFile();
	} catch {
		return false;
	}
}

function listSkillNames(source: string): string[] {
	try {
		return readdirSync(source).filter((name) => {
			if (name.startsWith(".")) return false;
			try {
				return statSync(join(source, name)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}

function linkTarget(link: string): string {
	return resolve(dirname(link), readlinkSync(link));
}

function isLinkIntoCheckouts(link: string, checkoutPaths: string[]): boolean {
	try {
		if (!lstatSync(link).isSymbolicLink()) return false;
		const target = linkTarget(link);
		return checkoutPaths.some((path) => target.startsWith(path + sep));
	} catch {
		return false;
	}
}

function isPresent(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

/** Entries of a real folder; null for a missing path, a file or a symlink. */
function listRealFolder(path: string): string[] | null {
	try {
		if (!lstatSync(path).isDirectory()) return null;
		return readdirSync(path);
	} catch {
		return null;
	}
}

/** True when each folder from the root down to `folder` is a real folder or missing. */
function isRealFolderPath(root: string, folder: string): boolean {
	let current = root;
	for (const part of relative(root, folder).split(sep)) {
		if (part === "") continue;
		current = join(current, part);
		try {
			if (!lstatSync(current).isDirectory()) return false;
		} catch (err) {
			return (err as NodeJS.ErrnoException).code === "ENOENT";
		}
	}
	return true;
}

function removeIfEmpty(path: string): void {
	if (listRealFolder(path)?.length === 0) rmdirSync(path);
}

function writeIfChanged(path: string, content: string): void {
	try {
		const stats = lstatSync(path);
		if (stats.isSymbolicLink()) {
			unlinkSync(path);
		} else if (!stats.isFile()) {
			console.warn(
				`[workspace-context-files] skipped ${path}: it is not a regular file`,
			);
			return;
		} else if (readFileSync(path, "utf8") === content) {
			return;
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
	writeFileSync(path, content);
}

function removeFile(path: string): void {
	try {
		unlinkSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

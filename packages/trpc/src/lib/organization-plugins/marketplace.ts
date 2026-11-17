import { createHash } from "node:crypto";
import { isPluginTreePath } from "@superset/shared/plugins/bundle";

export const MARKETPLACE_FILE = ".agent-marketplace.json";

const MANIFEST_FILE = "plugin.json";

export interface MarketplaceEntry {
	name: string;
	dir: string;
	/** What the entry says about the plugin, which stands in for a plugin.json the directory does not have. */
	declared: { name: string; version?: string; description?: string };
}

export interface MarketplaceProblem {
	name: string;
	reason: string;
}

export function joinRepoPath(...parts: string[]): string {
	return parts
		.flatMap((part) => part.split("/"))
		.filter((segment) => segment && segment !== ".")
		.join("/");
}

/** A plugin's own directory below the marketplace; the marketplace directory itself would bundle every plugin in it. */
function localDir(base: string, source: string): string | null {
	if (
		!source.startsWith("./") ||
		source.split("/").includes("..") ||
		!joinRepoPath(source)
	) {
		return null;
	}
	return joinRepoPath(base, source);
}

/** The plugins a marketplace file lists, each resolved to a `./` directory in the repository. Only plugins inside the repository can be synced. */
export const UNNAMED_ENTRY = "?";

export function parseMarketplace(
	raw: unknown,
	base: string,
): { entries: MarketplaceEntry[]; problems: MarketplaceProblem[] } {
	const catalog = (raw ?? {}) as { plugins?: unknown };
	if (!Array.isArray(catalog.plugins)) {
		throw new Error("the marketplace file has no plugins list");
	}

	const entries: MarketplaceEntry[] = [];
	const problems: MarketplaceProblem[] = [];
	for (const item of catalog.plugins as {
		name?: unknown;
		source?: unknown;
		version?: unknown;
		description?: unknown;
	}[]) {
		const name = typeof item?.name === "string" ? item.name : null;
		const text = (value: unknown) =>
			typeof value === "string" && value ? value : undefined;
		if (!name) {
			problems.push({ name: UNNAMED_ENTRY, reason: "an entry has no name" });
			continue;
		}
		const dir =
			typeof item.source === "string" ? localDir(base, item.source) : null;
		if (dir === null) {
			problems.push({
				name,
				reason:
					"its source is not a ./ directory below the marketplace file in this repository",
			});
			continue;
		}
		entries.push({
			name,
			dir,
			declared: {
				name,
				version: text(item.version),
				description: text(item.description),
			},
		});
	}
	return { entries, problems };
}

export function findMarketplaceFile(
	paths: ReadonlySet<string>,
	base: string,
): string | null {
	const path = joinRepoPath(base, MARKETPLACE_FILE);
	return paths.has(path) ? path : null;
}

export function findManifestFile(
	paths: ReadonlySet<string>,
	dir: string,
): string | null {
	const path = joinRepoPath(dir, MANIFEST_FILE);
	return paths.has(path) ? path : null;
}

/** Repository path to the path it takes in a plugin bundle: the whole plugin directory, as Codex copies it, besides its manifest and the excluded folders. */
export function pluginTreeFiles(
	paths: Iterable<string>,
	dir: string,
	nestedPluginDirs: readonly string[] = [],
): Map<string, string> {
	const prefix = dir ? `${dir}/` : "";
	const nested = nestedPluginDirs
		.filter((other) => other !== dir && other.startsWith(prefix))
		.map((other) => `${other}/`);
	const out = new Map<string, string>();
	for (const path of paths) {
		if (!path.startsWith(prefix)) continue;
		if (nested.some((other) => path.startsWith(other))) continue;
		const relative = path.slice(prefix.length);
		if (relative !== "plugin.json" && isPluginTreePath(relative)) {
			out.set(path, relative);
		}
	}
	return out;
}

/** A plugin with no version gets one from its content and executable bits, so an unchanged plugin keeps its version across syncs. */
export function withVersion(
	manifest: Record<string, unknown>,
	files: ReadonlyMap<string, Uint8Array>,
	executable: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
	if (typeof manifest.version === "string" && manifest.version) {
		return manifest;
	}
	const hash = createHash("sha256");
	hash.update(JSON.stringify(manifest));
	for (const [path, data] of [...files].sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		hash.update(path);
		hash.update(executable.has(path) ? "x" : "-");
		hash.update(data);
	}
	return { ...manifest, version: `0.0.0-${hash.digest("hex").slice(0, 12)}` };
}

export function skillsIn(
	files: ReadonlyMap<string, Uint8Array>,
): { name: string; description: string }[] {
	const skills: { name: string; description: string }[] = [];
	for (const [path, data] of files) {
		const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(path);
		if (!match) continue;
		const frontmatter =
			/^---\r?\n([\s\S]*?)\r?\n---/.exec(
				Buffer.from(data).toString("utf8"),
			)?.[1] ?? "";
		const field = (key: string) =>
			new RegExp(`^${key}:\\s*(.*)$`, "m")
				.exec(frontmatter)?.[1]
				?.trim()
				.replace(/^["']|["']$/g, "");
		skills.push({
			name: field("name") || (match[1] as string),
			description: field("description") ?? "",
		});
	}
	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

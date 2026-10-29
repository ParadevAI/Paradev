import { db } from "@superset/db/client";
import {
	organizationPluginSources,
	organizationPlugins,
	type SelectOrganizationPluginSource,
} from "@superset/db/schema";
import { DEFAULT_ORGANIZATION_PLUGIN_POLICY } from "@superset/shared/plugins";
import {
	PLUGIN_BUNDLE_MAX_BYTES,
	PLUGIN_BUNDLE_MAX_FILES,
	PLUGIN_BUNDLE_MAX_UNPACKED_BYTES,
	packPluginBundle,
	pluginBundleHash,
	pluginTreeHash,
	unpackPluginBundle,
} from "@superset/shared/plugins/bundle";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { getObject, putObject } from "../r2";
import { nudge } from "../realtime";
import { sourceCredentials } from "./credentials";
import { type RepositorySnapshot, readAll, repositorySnapshot } from "./github";
import {
	findManifestFile,
	findMarketplaceFile,
	MARKETPLACE_FILE,
	type MarketplaceEntry,
	type MarketplaceProblem,
	parseMarketplace,
	pluginTreeFiles,
	skillsIn,
	withVersion,
} from "./marketplace";
import { organizationBundleKey, readOrganizationBundle } from "./rules";

export interface SourceSyncResult {
	sha: string | null;
	synced: string[];
	unchanged: string[];
	removed: string[];
	problems: MarketplaceProblem[];
	error: string | null;
}

/** Refuses a plugin too big to bundle from the repository listing, before any file is downloaded. */
function assertFitsInBundle(
	snapshot: RepositorySnapshot,
	repoPaths: readonly string[],
): void {
	if (repoPaths.length > PLUGIN_BUNDLE_MAX_FILES) {
		throw new Error(
			`it has ${repoPaths.length} files, over the limit of ${PLUGIN_BUNDLE_MAX_FILES}`,
		);
	}
	const bytes = repoPaths.reduce(
		(sum, path) => sum + (snapshot.sizes?.get(path) ?? 0),
		0,
	);
	// Bundles store files as base64, a third larger than the files.
	if (Math.ceil(bytes / 3) * 4 > PLUGIN_BUNDLE_MAX_UNPACKED_BYTES) {
		throw new Error(
			`its files are ${bytes} bytes, too large for a plugin bundle (${PLUGIN_BUNDLE_MAX_UNPACKED_BYTES} bytes encoded)`,
		);
	}
	const incompressible = repoPaths
		.filter((path) => COMPRESSED_FILE.test(path))
		.reduce((sum, path) => sum + (snapshot.sizes?.get(path) ?? 0), 0);
	if (incompressible > PLUGIN_BUNDLE_MAX_BYTES) {
		throw new Error(
			`its images, archives and other compressed files are ${incompressible} bytes, over the ${PLUGIN_BUNDLE_MAX_BYTES} byte limit for a packed plugin`,
		);
	}
}

const COMPRESSED_FILE =
	/\.(png|jpe?g|gif|webp|avif|ico|zip|gz|tgz|bz2|xz|7z|mp3|mp4|mov|webm|woff2?|pdf)$/i;

interface PluginBuild {
	bundle: Buffer;
	treeHash: string;
	skills: ReturnType<typeof skillsIn>;
}

async function bundleFor(
	snapshot: RepositorySnapshot,
	entry: MarketplaceEntry,
): Promise<PluginBuild> {
	const manifestPath = findManifestFile(snapshot.paths, entry.dir);
	const tree = pluginTreeFiles(snapshot.paths, entry.dir);
	assertFitsInBundle(snapshot, [
		...(manifestPath ? [manifestPath] : []),
		...tree.keys(),
	]);
	const contents = await readAll(snapshot, [
		...(manifestPath ? [manifestPath] : []),
		...tree.keys(),
	]);

	const files = new Map<string, Uint8Array>();
	for (const [repoPath, bundlePath] of tree) {
		files.set(bundlePath, contents.get(repoPath) as Buffer);
	}
	let manifest: Record<string, unknown> = { ...entry.declared };
	if (manifestPath) {
		try {
			manifest = JSON.parse(
				(contents.get(manifestPath) as Buffer).toString("utf8"),
			);
		} catch {
			throw new Error(`${manifestPath} is not valid JSON`);
		}
	}
	if (manifest.name !== entry.name) {
		throw new Error(
			`its plugin.json is named "${String(manifest.name)}", not "${entry.name}"`,
		);
	}
	const executable = new Set(
		[...tree]
			.filter(([repoPath]) => snapshot.executable?.has(repoPath))
			.map(([, bundlePath]) => bundlePath),
	);
	files.set(
		"plugin.json",
		Buffer.from(
			JSON.stringify(withVersion(manifest, files, executable), null, "\t"),
		),
	);
	return {
		bundle: packPluginBundle(files, executable),
		treeHash: pluginTreeHash({ files, executable }),
		skills: skillsIn(files),
	};
}

/** Whether the stored bundle holds other files than this build, read only when the version stayed the same. A missing bundle counts as changed. */
async function filesChanged(
	organizationId: string,
	contentHash: string,
	build: PluginBuild,
): Promise<boolean> {
	const object = await getObject(
		organizationBundleKey(organizationId, contentHash),
	);
	if (!object) return true;
	const stored = unpackPluginBundle(Buffer.from(await object.arrayBuffer()));
	return pluginTreeHash(stored) !== build.treeHash;
}

const CREDENTIAL_LABEL = {
	admin: "the GitHub account of the admin who added it",
	app: "the organization's GitHub App",
} as const;

async function readWithFirstCredential(
	source: SelectOrganizationPluginSource,
	readSnapshot: typeof repositorySnapshot,
): Promise<RepositorySnapshot> {
	const credentials = await sourceCredentials(source);
	if (!credentials.length) {
		throw new Error(
			"nothing can read the repository: the admin who added it has no connected GitHub account, and the organization's GitHub App is not installed",
		);
	}
	const failures: string[] = [];
	for (const credential of credentials) {
		try {
			return await readSnapshot({
				token: await credential.token(),
				repo: source.repo,
				ref: source.ref,
			});
		} catch (error) {
			failures.push(
				`${CREDENTIAL_LABEL[credential.as]}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	throw new Error(`could not read the repository with ${failures.join("; ")}`);
}

async function syncSnapshot(
	source: SelectOrganizationPluginSource,
	snapshot: RepositorySnapshot,
	result: SourceSyncResult,
): Promise<void> {
	const file = findMarketplaceFile(snapshot.paths, source.path);
	if (!file) {
		throw new Error(
			`no ${MARKETPLACE_FILE} at ${source.path || "the repository root"}`,
		);
	}
	let raw: unknown;
	try {
		raw = JSON.parse((await snapshot.read(file)).toString("utf8"));
	} catch {
		throw new Error(`${file} is not valid JSON`);
	}
	const { entries, problems } = parseMarketplace(raw, source.path);
	result.problems.push(...problems);

	const existing = await db
		.select()
		.from(organizationPlugins)
		.where(eq(organizationPlugins.organizationId, source.organizationId));
	const byName = new Map(existing.map((row) => [row.name, row]));
	const seen: string[] = problems
		.map((problem) => problem.name)
		.filter((name) => byName.get(name)?.sourceId === source.id);

	for (const entry of entries) {
		try {
			const current = byName.get(entry.name);
			if (current && current.sourceId !== source.id) {
				throw new Error(
					"another source of this organization already has a plugin with this name",
				);
			}
			const build = await bundleFor(snapshot, entry);
			const { bundle, skills } = build;
			const manifest = { ...readOrganizationBundle(bundle), skills };
			const contentHash = pluginBundleHash(bundle);
			seen.push(entry.name);

			if (
				current &&
				current.version === manifest.version &&
				current.contentHash !== contentHash &&
				(await filesChanged(source.organizationId, current.contentHash, build))
			) {
				throw new Error(
					`its content changed but its version is still ${manifest.version}; bump the version`,
				);
			}
			if (
				current?.contentHash === contentHash &&
				!current.removedFromSourceAt
			) {
				result.unchanged.push(entry.name);
				continue;
			}
			await putObject({
				key: organizationBundleKey(source.organizationId, contentHash),
				body: bundle,
				contentType: "application/gzip",
				bucket: "private",
			});
			const written = await db
				.insert(organizationPlugins)
				.values({
					organizationId: source.organizationId,
					sourceId: source.id,
					name: manifest.name,
					version: manifest.version,
					manifest,
					contentHash,
					installPolicy: DEFAULT_ORGANIZATION_PLUGIN_POLICY,
				})
				.onConflictDoUpdate({
					target: [
						organizationPlugins.organizationId,
						organizationPlugins.name,
					],
					set: {
						version: manifest.version,
						manifest,
						contentHash,
						removedFromSourceAt: null,
					},
					setWhere: eq(organizationPlugins.sourceId, source.id),
				})
				.returning({ id: organizationPlugins.id });
			if (!written.length) {
				throw new Error(
					"another source of this organization already has a plugin with this name",
				);
			}
			result.synced.push(entry.name);
		} catch (error) {
			if (byName.get(entry.name)?.sourceId === source.id) {
				seen.push(entry.name);
			}
			result.problems.push({
				name: entry.name,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const removed = await db
		.update(organizationPlugins)
		.set({ removedFromSourceAt: new Date() })
		.where(
			and(
				eq(organizationPlugins.sourceId, source.id),
				isNull(organizationPlugins.removedFromSourceAt),
				seen.length ? notInArray(organizationPlugins.name, seen) : undefined,
			),
		)
		.returning({ name: organizationPlugins.name });
	result.removed.push(...removed.map((row) => row.name));
}

/**
 * Brings an organization's plugins in line with one repository source. A
 * plugin that fails keeps its last good version; one that left the
 * repository is marked, not deleted, so members keep what they installed.
 */
export async function syncOrganizationPluginSource(
	sourceId: string,
	readSnapshot: typeof repositorySnapshot = repositorySnapshot,
): Promise<SourceSyncResult | null> {
	const source = await db.query.organizationPluginSources.findFirst({
		where: eq(organizationPluginSources.id, sourceId),
	});
	if (!source) return null;

	const result: SourceSyncResult = {
		sha: null,
		synced: [],
		unchanged: [],
		removed: [],
		problems: [],
		error: null,
	};

	try {
		const snapshot = await readWithFirstCredential(source, readSnapshot);
		result.sha = snapshot.sha;

		if (source.syncedSha !== snapshot.sha || source.syncError) {
			await syncSnapshot(source, snapshot, result);
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}

	const problems = result.problems.map((p) => `${p.name}: ${p.reason}`);
	await db
		.update(organizationPluginSources)
		.set({
			...(result.error ? {} : { syncedSha: result.sha, syncedAt: new Date() }),
			syncError: [result.error, ...problems].filter(Boolean).join("\n") || null,
		})
		.where(eq(organizationPluginSources.id, source.id));

	if (result.synced.length || result.removed.length) {
		nudge(source.organizationId, "plugins");
	}
	return result;
}

export async function syncAllOrganizationPluginSources(
	enqueue: (sourceId: string) => Promise<void> = async (sourceId) => {
		await syncOrganizationPluginSource(sourceId);
	},
): Promise<{
	sources: number;
	failed: number;
}> {
	const sources = await db
		.select({ id: organizationPluginSources.id })
		.from(organizationPluginSources);
	let failed = 0;
	for (const source of sources) {
		try {
			await enqueue(source.id);
		} catch (error) {
			console.error("[organization-plugins] enqueue failed", source.id, error);
			failed++;
		}
	}
	return { sources: sources.length, failed };
}

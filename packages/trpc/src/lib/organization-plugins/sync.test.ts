import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import {
	organizationPluginSources,
	organizationPlugins,
} from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { stub } from "../../../test/stub";
import * as r2 from "../r2";
import * as realtime from "../realtime";
import * as credentials from "./credentials";
import type { RepositorySnapshot } from "./github";

const ORG = "org-1";
const SOURCE = {
	id: "source-1",
	organizationId: ORG,
	repo: "acme/plugins",
	ref: null,
	path: "",
	syncedSha: null as string | null,
	syncedAt: null,
	syncError: null as string | null,
	syncProblems: [] as { name: string; reason: string }[],
	addedByUserId: "user-1",
};

interface PluginRow {
	id: string;
	organizationId: string;
	sourceId: string;
	name: string;
	version: string;
	contentHash: string;
	sourceFingerprint?: string | null;
	removedFromSourceAt: Date | null;
}

const dialect = new PgDialect();
const params = (condition: SQL) => dialect.sqlToQuery(condition).params;

let source = { ...SOURCE };
let plugins: PluginRow[] = [];
let writtenMeanwhile: PluginRow[] = [];
let objects = new Map<string, Uint8Array>();
let reads: string[] = [];
let sourceWrites: Record<string, unknown>[] = [];
let removalParams: unknown[][] = [];
let removedNames: string[] = [];
let nudges: string[] = [];

stub(realtime, {
	nudge: (organizationId: string, kind: string) => {
		nudges.push(`${organizationId}:${kind}`);
	},
});

stub(credentials, { sourceToken: async () => "token" });
stub(r2, {
	putObject: async ({ key, body }: { key: string; body: Uint8Array }) => {
		objects.set(key, body);
	},
	getObject: async (key: string) => {
		const body = objects.get(key);
		return body ? new Response(body) : null;
	},
	deleteObjects: async (keys: string[]) => {
		for (const key of keys) objects.delete(key);
	},
});
stub(db, {
	query: {
		organizationPluginSources: { findFirst: async () => source },
	},
	select: () => ({
		from: () => ({ where: async () => plugins.map((row) => ({ ...row })) }),
	}),
	insert: () => ({
		values: (values: Omit<PluginRow, "id">) => ({
			onConflictDoUpdate: ({ set }: { set: Partial<PluginRow> }) => ({
				returning: async () => {
					const current = [...plugins, ...writtenMeanwhile].find(
						(row) => row.name === values.name,
					);
					if (!current) {
						plugins.push({
							...values,
							id: values.name,
							removedFromSourceAt: null,
						});
						return [{ id: values.name }];
					}
					if (current.sourceId !== source.id) return [];
					Object.assign(current, set);
					return [{ id: current.id }];
				},
			}),
		}),
	}),
	update: (table: unknown) => ({
		set: (values: Record<string, unknown>) => ({
			where: (condition: SQL) => {
				if (table === organizationPluginSources) sourceWrites.push(values);
				if (table === organizationPlugins) {
					removalParams.push(params(condition));
				}
				return Object.assign(Promise.resolve(), {
					returning: async () => removedNames.map((name) => ({ name })),
				});
			},
		}),
	}),
});

const { syncOrganizationPluginSource } = await import("./sync");

function repo(
	sha: string,
	files: Record<string, string>,
	extra: Partial<RepositorySnapshot> = {},
) {
	return async (): Promise<RepositorySnapshot> => ({
		sha,
		paths: new Set(Object.keys(files)),
		read: async (path) => {
			reads.push(path);
			return Buffer.from(files[path] ?? "");
		},
		...extra,
	});
}

/** The tree listing's blob hashes, which change exactly when a file does. */
const blobsOf = (files: Record<string, string>) =>
	new Map(
		Object.entries(files).map(([path, body]) => [
			path,
			createHash("sha1").update(body).digest("hex"),
		]),
	);

const marketplace = (...names: string[]) =>
	JSON.stringify({
		plugins: names.map((name) => ({ name, source: `./plugins/${name}` })),
	});

const plugin = (name: string, version: string, skill = "first") => ({
	[`plugins/${name}/plugin.json`]: JSON.stringify({ name, version }),
	[`plugins/${name}/skills/a/SKILL.md`]: `---\nname: a\n---\n${skill}`,
});

beforeEach(() => {
	source = { ...SOURCE };
	plugins = [];
	writtenMeanwhile = [];
	objects = new Map();
	reads = [];
	sourceWrites = [];
	removalParams = [];
	removedNames = [];
	nudges = [];
});

describe("syncOrganizationPluginSource", () => {
	test("an unchanged commit reads no files but still records the sync", async () => {
		source.syncedSha = "sha-1";
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", { ".agent-marketplace.json": marketplace() }),
		);
		expect(result?.error).toBeNull();
		expect(reads).toEqual([]);
		expect(sourceWrites[0]).toMatchObject({
			syncedSha: "sha-1",
			syncError: null,
		});
		expect(sourceWrites[0]?.syncedAt).toBeInstanceOf(Date);
	});

	test("re-packing the same files under the same version is not a change", async () => {
		const files = {
			".agent-marketplace.json": marketplace("tools"),
			...plugin("tools", "1.0.0"),
		};
		await syncOrganizationPluginSource(SOURCE.id, repo("sha-1", files));
		const stored = plugins[0] as PluginRow;
		stored.contentHash = "packed-differently";
		const bytes = [...objects.values()][0] as Uint8Array;
		objects.set(
			`organization-plugins/${ORG}/packed-differently.json.gz`,
			bytes,
		);

		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-2", files),
		);
		expect(result?.problems).toEqual([]);
		expect(result?.synced).toEqual(["tools"]);
	});

	test("new files under the same version are refused", async () => {
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "1.0.0"),
			}),
		);
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-2", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "1.0.0", "second"),
			}),
		);
		expect(result?.problems[0]?.reason).toContain("bump the version");
	});

	test("a plugin over the file limit is refused before any file is read", async () => {
		const many = Object.fromEntries(
			Array.from({ length: 501 }, (_, i) => [
				`plugins/big/assets/${i}.txt`,
				"x",
			]),
		);
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": marketplace("big"),
				"plugins/big/plugin.json": JSON.stringify({
					name: "big",
					version: "1.0.0",
				}),
				...many,
			}),
		);
		expect(result?.problems[0]?.reason).toContain("over the limit");
		expect(reads).toEqual([".agent-marketplace.json"]);
	});

	test("a plugin over the size limit is refused before any file is read", async () => {
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo(
				"sha-1",
				{
					".agent-marketplace.json": marketplace("big"),
					...plugin("big", "1.0.0"),
				},
				{
					sizes: new Map([["plugins/big/skills/a/SKILL.md", 20 * 1024 * 1024]]),
				},
			),
		);
		expect(result?.problems[0]?.reason).toContain("too large");
		expect(reads).toEqual([".agent-marketplace.json"]);
	});

	test("a same-version change is refused when the stored bundle is missing", async () => {
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "1.0.0"),
			}),
		);
		objects.clear();
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-2", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "1.0.0", "second"),
			}),
		);
		expect(result?.problems[0]?.reason).toContain("bump the version");
	});

	test("images over the packed limit are refused before any file is read", async () => {
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo(
				"sha-1",
				{
					".agent-marketplace.json": marketplace("big"),
					...plugin("big", "1.0.0"),
					"plugins/big/assets/screenshot.png": "",
				},
				{
					sizes: new Map([
						["plugins/big/assets/screenshot.png", 3 * 1024 * 1024],
					]),
				},
			),
		);
		expect(result?.problems[0]?.reason).toContain("compressed files");
		expect(reads).toEqual([".agent-marketplace.json"]);
	});

	test("a plugin another source wrote during this sync is reported, not overwritten", async () => {
		writtenMeanwhile.push({
			id: "tools",
			organizationId: ORG,
			sourceId: "source-2",
			name: "tools",
			version: "1.0.0",
			contentHash: "theirs",
			removedFromSourceAt: null,
		});
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "2.0.0"),
			}),
		);
		expect(result?.synced).toEqual([]);
		expect(result?.problems[0]?.reason).toContain("another source");
		expect(writtenMeanwhile[0]?.contentHash).toBe("theirs");
	});

	test("an invalid entry for a plugin this source owns is not marked as gone", async () => {
		plugins.push({
			id: "tools",
			organizationId: ORG,
			sourceId: SOURCE.id,
			name: "tools",
			version: "1.0.0",
			contentHash: "old",
			removedFromSourceAt: null,
		});
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": JSON.stringify({
					plugins: [{ name: "tools", source: "plugins/tools" }],
				}),
			}),
		);
		expect(removalParams[0]).toContain("tools");
	});

	test("members' apps hear about a new version, not about an unchanged sync", async () => {
		const files = {
			".agent-marketplace.json": marketplace("tools"),
			...plugin("tools", "1.0.0"),
		};
		await syncOrganizationPluginSource(SOURCE.id, repo("sha-1", files));
		expect(nudges).toEqual([`${ORG}:plugins`]);

		await syncOrganizationPluginSource(SOURCE.id, repo("sha-2", files));
		expect(nudges).toEqual([`${ORG}:plugins`]);
	});

	test("members' apps hear about a plugin leaving the repository", async () => {
		removedNames = ["gone"];
		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", { ".agent-marketplace.json": marketplace() }),
		);
		expect(result?.removed).toEqual(["gone"]);
		expect(nudges).toEqual([`${ORG}:plugins`]);
	});

	test("a new commit downloads only the plugins whose files changed", async () => {
		const files = {
			".agent-marketplace.json": marketplace("tools", "notes"),
			...plugin("tools", "1.0.0"),
			...plugin("notes", "1.0.0"),
		};
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", files, { blobs: blobsOf(files) }),
		);
		reads = [];
		const changed = { ...files, ...plugin("notes", "1.1.0", "second") };

		const result = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-2", changed, { blobs: blobsOf(changed) }),
		);

		expect(result?.synced).toEqual(["notes"]);
		expect(result?.unchanged).toEqual(["tools"]);
		expect(reads.some((path) => path.startsWith("plugins/tools/"))).toBe(false);
	});

	test("a lasting problem in one plugin does not re-download the others", async () => {
		const files = {
			".agent-marketplace.json": marketplace("tools", "notes"),
			...plugin("tools", "1.0.0"),
			"plugins/notes/plugin.json": JSON.stringify({ name: "other" }),
		};
		const first = await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", files, { blobs: blobsOf(files) }),
		);
		expect(sourceWrites.at(-1)?.syncError).toBeNull();
		expect(sourceWrites.at(-1)?.syncProblems).toEqual(first?.problems);
		source.syncedSha = "sha-1";
		source.syncProblems = first?.problems ?? [];
		reads = [];

		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", files, { blobs: blobsOf(files) }),
		);

		expect(reads.some((path) => path.startsWith("plugins/tools/"))).toBe(false);
	});

	test("a replaced version's bundle is deleted from storage", async () => {
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "1.0.0"),
			}),
		);
		const firstKey = [...objects.keys()][0];
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-2", {
				".agent-marketplace.json": marketplace("tools"),
				...plugin("tools", "1.1.0", "second"),
			}),
		);
		expect(objects.has(firstKey as string)).toBe(false);
		expect(objects.size).toBe(1);
	});

	test("an entry with no name marks nothing as gone", async () => {
		plugins.push({
			id: "tools",
			organizationId: ORG,
			sourceId: SOURCE.id,
			name: "tools",
			version: "1.0.0",
			contentHash: "old",
			removedFromSourceAt: null,
		});
		await syncOrganizationPluginSource(
			SOURCE.id,
			repo("sha-1", {
				".agent-marketplace.json": JSON.stringify({
					plugins: [{ source: "./plugins/tools" }],
				}),
			}),
		);
		expect(removalParams).toEqual([]);
	});

	test("a removed source is nothing to do", async () => {
		source = undefined as never;
		expect(
			await syncOrganizationPluginSource(SOURCE.id, repo("sha-1", {})),
		).toBeNull();
	});
});

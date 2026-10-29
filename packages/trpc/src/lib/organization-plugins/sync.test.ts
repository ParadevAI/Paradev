import { beforeEach, describe, expect, test } from "bun:test";
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
	addedByUserId: "user-1",
};

interface PluginRow {
	id: string;
	organizationId: string;
	sourceId: string;
	name: string;
	version: string;
	contentHash: string;
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

stub(credentials, {
	sourceCredentials: async () => [{ as: "admin", token: async () => "token" }],
});
stub(r2, {
	putObject: async ({ key, body }: { key: string; body: Uint8Array }) => {
		objects.set(key, body);
	},
	getObject: async (key: string) => {
		const body = objects.get(key);
		return body ? new Response(body) : null;
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

	test("a removed source is nothing to do", async () => {
		source = undefined as never;
		expect(
			await syncOrganizationPluginSource(SOURCE.id, repo("sha-1", {})),
		).toBeNull();
	});
});

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedProject, seedWorkspace } from "../../../../../test/helpers/seed";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import {
	isCodexFolderTrusted,
	resolveTrustFamily,
	revokeAgyFolderTrust,
	revokeCodexFolderTrust,
	revokeRootTrustForNewPrimary,
	seedAgyFolderTrust,
	seedClaudeFolderTrust,
	seedCodexFolderTrust,
	seedWorkspaceFolderTrust,
} from "./seed-agent-trust";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "seed-agent-trust-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("resolveTrustFamily", () => {
	test("matches by preset id", () => {
		expect(resolveTrustFamily({ presetId: "claude", command: "claude" })).toBe(
			"claude",
		);
		expect(resolveTrustFamily({ presetId: "codex", command: "codex" })).toBe(
			"codex",
		);
		expect(
			resolveTrustFamily({
				presetId: "agy",
				command: "agy --mode accept-edits",
			}),
		).toBe("agy");
	});

	test("matches custom presets by launch executable", () => {
		expect(
			resolveTrustFamily({
				presetId: "custom-abc",
				command: "/usr/local/bin/claude --verbose",
			}),
		).toBe("claude");
		expect(
			resolveTrustFamily({
				presetId: "custom-def",
				command: "C:\\tools\\codex.exe",
			}),
		).toBe("codex");
	});

	test("returns null for providers without a known trust store", () => {
		expect(resolveTrustFamily({ presetId: "gemini", command: "gemini" })).toBe(
			null,
		);
		expect(
			resolveTrustFamily({ presetId: "custom-xyz", command: "my-agent" }),
		).toBe(null);
	});
});

describe("seedClaudeFolderTrust", () => {
	test("creates the state file with the trusted entry", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-a");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.projects["/tmp/session-a"].hasTrustDialogAccepted).toBe(true);
	});

	test("merges into existing state, preserving other keys", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(
			file,
			JSON.stringify({
				oauthAccount: { emailAddress: "x@y.z" },
				projects: {
					"/existing": { hasTrustDialogAccepted: true, allowedTools: ["Bash"] },
					"/tmp/session-b": { allowedTools: ["Edit"] },
				},
			}),
		);
		await seedClaudeFolderTrust(file, "/tmp/session-b");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.oauthAccount.emailAddress).toBe("x@y.z");
		expect(state.projects["/existing"].allowedTools).toEqual(["Bash"]);
		expect(state.projects["/tmp/session-b"]).toEqual({
			allowedTools: ["Edit"],
			hasTrustDialogAccepted: true,
		});
	});

	test("no-ops when the entry is already trusted", async () => {
		const file = join(dir, ".claude.json");
		const content = JSON.stringify({
			projects: { "/tmp/session-c": { hasTrustDialogAccepted: true } },
		});
		writeFileSync(file, content);
		await seedClaudeFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("throws on a corrupt state file without clobbering it", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{not json");
		await expect(
			seedClaudeFolderTrust(file, "/tmp/session-d"),
		).rejects.toThrow();
		expect(readFileSync(file, "utf-8")).toBe("{not json");
	});

	test("skips when the config dir itself does not exist", async () => {
		const file = join(dir, "missing-profile", ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-e");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("preserves a tightened file mode across the rewrite", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{}");
		chmodSync(file, 0o600);
		await seedClaudeFolderTrust(file, "/tmp/session-f");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	test("creates a brand-new store owner-only", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-g");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	test("writes through a symlinked state file instead of replacing it", async () => {
		const dotfiles = join(dir, "dotfiles-claude");
		const home = join(dir, "home");
		mkdirSync(dotfiles);
		mkdirSync(home);
		const real = join(dotfiles, ".claude.json");
		writeFileSync(real, JSON.stringify({ oauthAccount: { id: "a" } }));
		const file = join(home, ".claude.json");
		symlinkSync(real, file);

		await seedClaudeFolderTrust(file, "/tmp/session-link");

		expect(lstatSync(file).isSymbolicLink()).toBe(true);
		const state = JSON.parse(readFileSync(real, "utf-8"));
		expect(state.oauthAccount.id).toBe("a");
		expect(state.projects["/tmp/session-link"].hasTrustDialogAccepted).toBe(
			true,
		);
		expect(readdirSync(home)).toEqual([".claude.json"]);
	});
});

describe("seedAgyFolderTrust", () => {
	test("appends to trustedWorkspaces, preserving other keys", async () => {
		const file = join(dir, "settings.json");
		writeFileSync(
			file,
			JSON.stringify({ trustedWorkspaces: ["/other"], theme: "dark" }),
		);
		await seedAgyFolderTrust(file, "/tmp/session-a");
		await seedAgyFolderTrust(file, "/tmp/session-a");
		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({
			trustedWorkspaces: ["/other", "/tmp/session-a"],
			theme: "dark",
		});
	});

	test("leaves a never-set-up agy alone", async () => {
		await seedAgyFolderTrust(
			join(dir, "missing", "settings.json"),
			"/tmp/session-b",
		);
		expect(readdirSync(dir)).toEqual([]);
	});
});

describe("seedCodexFolderTrust", () => {
	test("creates config.toml with the trusted table", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-a");
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/session-a"]\ntrust_level = "trusted"\n',
		);
	});

	test("appends after existing content, preserving it", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n',
		);
		await seedCodexFolderTrust(file, "/tmp/session-b");
		expect(readFileSync(file, "utf-8")).toBe(
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/tmp/session-b"]\ntrust_level = "trusted"\n',
		);
	});

	test("leaves an existing table for the path untouched", async () => {
		const file = join(dir, "config.toml");
		const content = '[projects."/tmp/session-c"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("escapes quotes and backslashes in the path key", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "trusted"\n',
		);
	});

	test("skips when the codex home does not exist", async () => {
		const file = join(dir, "missing-home", "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-d");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("detects an equivalent header with different spacing", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[ projects . "/tmp/session-e" ]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-e");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a literal-string header", async () => {
		const file = join(dir, "config.toml");
		const content =
			"[projects.'/tmp/session-f']\ntrust_level = \"untrusted\"\n";
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-f");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a top-level dotted key", async () => {
		const file = join(dir, "config.toml");
		const content = 'projects."/tmp/session-g".trust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-g");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("matches an escaped header against the raw path", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("trusts again a folder whose revoke kept its table for other keys", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'projects."/dotted".note = "y"\n\n[projects."/root"]\ntrust_level = "trusted"\nnote = "x"\n',
		);
		await revokeCodexFolderTrust(file, ["/root", "/dotted"]);
		expect(await isCodexFolderTrusted(file, ["/root"])).toBe(false);

		await seedCodexFolderTrust(file, "/root");
		await seedCodexFolderTrust(file, "/dotted");

		expect(readFileSync(file, "utf-8")).toBe(
			'projects."/dotted".note = "y"\n\nprojects."/dotted".trust_level = "trusted"\n[projects."/root"]\ntrust_level = "trusted"\nnote = "x"\n',
		);
		expect(await isCodexFolderTrusted(file, ["/root"])).toBe(true);
		expect(await isCodexFolderTrusted(file, ["/dotted"])).toBe(true);
	});

	test("still appends when only a different path is defined", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(file, '[ projects . "/other" ]\ntrust_level = "trusted"\n');
		await seedCodexFolderTrust(file, "/tmp/session-h");
		expect(readFileSync(file, "utf-8")).toContain(
			'[projects."/tmp/session-h"]\ntrust_level = "trusted"\n',
		);
	});

	test("writes through a symlinked config.toml instead of replacing it", async () => {
		const dotfiles = join(dir, "dotfiles");
		const codexHome = join(dir, ".codex");
		mkdirSync(dotfiles);
		mkdirSync(codexHome);
		const real = join(dotfiles, "config.toml");
		writeFileSync(real, 'model = "gpt-5"\n');
		const file = join(codexHome, "config.toml");
		symlinkSync(real, file);

		await seedCodexFolderTrust(file, "/tmp/session-link");

		expect(lstatSync(file).isSymbolicLink()).toBe(true);
		expect(readFileSync(real, "utf-8")).toBe(
			'model = "gpt-5"\n\n[projects."/tmp/session-link"]\ntrust_level = "trusted"\n',
		);
		expect(readdirSync(codexHome)).toEqual(["config.toml"]);
	});
});

describe("seedWorkspaceFolderTrust", () => {
	function setup() {
		const db = drizzle(new Database(":memory:"), {
			schema,
		}) as unknown as HostDb;
		migrate(db as never, {
			migrationsFolder: resolve(import.meta.dir, "../../../../../drizzle"),
		});
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "claude-test",
				presetId: "claude",
				label: "Claude",
				command: "claude",
				promptTransport: "argv",
				envJson: JSON.stringify({ CLAUDE_CONFIG_DIR: dir }),
				displayOrder: 0,
			})
			.run();
		const trusted = () => {
			try {
				const state = JSON.parse(
					readFileSync(join(dir, ".claude.json"), "utf-8"),
				);
				return Object.keys(state.projects);
			} catch {
				return [];
			}
		};
		return { db, trusted };
	}

	test("trusts a multi-repo root whose primary repository is trusted, not a worktree of one repository", async () => {
		const { db, trusted } = setup();
		writeFileSync(
			join(dir, ".claude.json"),
			JSON.stringify({
				projects: { [join(dir, "web")]: { hasTrustDialogAccepted: true } },
			}),
		);
		const single = seedProject({ db }, { repoPath: join(dir, "solo") });
		const multi = seedProject(
			{ db },
			{
				repoPath: join(dir, "web"),
				repositories: [{ repoPath: join(dir, "api") }],
			},
		);
		const worktree = seedWorkspace(
			{ db },
			{ projectId: single.id, worktreePath: join(dir, "wt"), branch: "a" },
		);
		const root = seedWorkspace(
			{ db },
			{ projectId: multi.id, worktreePath: join(dir, "root"), branch: "b" },
		);

		await seedWorkspaceFolderTrust(db, worktree.id, "claude-test");
		expect(trusted()).toEqual([join(dir, "web")]);
		await seedWorkspaceFolderTrust(db, root.id, "claude-test");
		expect(trusted()).toEqual([join(dir, "web"), join(dir, "root")]);
	});

	test("leaves a multi-repo root untrusted while its primary repository is not trusted", async () => {
		const { db, trusted } = setup();
		writeFileSync(
			join(dir, ".claude.json"),
			JSON.stringify({
				projects: {
					[join(dir, "web")]: { hasTrustDialogAccepted: false },
					[join(dir, "api")]: { hasTrustDialogAccepted: true },
				},
			}),
		);
		const multi = seedProject(
			{ db },
			{
				repoPath: join(dir, "web"),
				repositories: [{ repoPath: join(dir, "api") }],
			},
		);
		const root = seedWorkspace(
			{ db },
			{ projectId: multi.id, worktreePath: join(dir, "root"), branch: "b" },
		);

		await seedWorkspaceFolderTrust(db, root.id, "claude-test");
		expect(trusted()).toEqual([join(dir, "web"), join(dir, "api")]);
	});

	test("a root without the primary checkout is trusted by the repository whose config it links", async () => {
		const { db, trusted } = setup();
		const store = (apiTrusted: boolean) =>
			writeFileSync(
				join(dir, ".claude.json"),
				JSON.stringify({
					projects: {
						[join(dir, "web")]: { hasTrustDialogAccepted: true },
						[join(dir, "api")]: { hasTrustDialogAccepted: apiTrusted },
					},
				}),
			);
		const multi = seedProject(
			{ db },
			{
				repoPath: join(dir, "web"),
				repositories: [
					{ repoPath: join(dir, "lib") },
					{ repoPath: join(dir, "api") },
				],
			},
		);
		const [, libId, apiId] = multi.repositoryIds;
		const root = seedWorkspace(
			{ db },
			{
				projectId: multi.id,
				worktreePath: join(dir, "root"),
				branch: "b",
				repositoryIds: [libId as string, apiId as string],
			},
		);

		store(false);
		await seedWorkspaceFolderTrust(db, root.id, "claude-test");
		expect(trusted()).toEqual([join(dir, "web"), join(dir, "api")]);

		store(true);
		await seedWorkspaceFolderTrust(db, root.id, "claude-test");
		expect(trusted()).toEqual([
			join(dir, "web"),
			join(dir, "api"),
			join(dir, "root"),
		]);
	});

	function seedTrustedRoot(db: HostDb, apiTrusted: boolean) {
		const rootPath = join(dir, "root");
		writeFileSync(
			join(dir, ".claude.json"),
			JSON.stringify({
				theme: "dark",
				projects: {
					[join(dir, "web")]: { hasTrustDialogAccepted: true },
					[join(dir, "api")]: { hasTrustDialogAccepted: apiTrusted },
					[rootPath]: { hasTrustDialogAccepted: true, history: ["x"] },
				},
			}),
		);
		const multi = seedProject(
			{ db },
			{
				repoPath: join(dir, "web"),
				repositories: [{ repoPath: join(dir, "api") }],
			},
		);
		seedWorkspace(
			{ db },
			{ projectId: multi.id, worktreePath: rootPath, branch: "b" },
		);
		const [, apiId] = multi.repositoryIds;
		db.update(schema.projects)
			.set({ primaryRepositoryId: apiId })
			.where(eq(schema.projects.id, multi.id))
			.run();
		return {
			projectId: multi.id,
			previousPrimaryId: multi.repositoryId,
			rootPath,
		};
	}

	const readState = () =>
		JSON.parse(readFileSync(join(dir, ".claude.json"), "utf-8"));

	test("a new primary the agent does not trust takes the root's trust away, and nothing else", async () => {
		const { db } = setup();
		const { projectId, previousPrimaryId, rootPath } = seedTrustedRoot(
			db,
			false,
		);

		await revokeRootTrustForNewPrimary(db, projectId, previousPrimaryId);

		expect(readState()).toEqual({
			theme: "dark",
			projects: {
				[join(dir, "web")]: { hasTrustDialogAccepted: true },
				[join(dir, "api")]: { hasTrustDialogAccepted: false },
				[rootPath]: { hasTrustDialogAccepted: false, history: ["x"] },
			},
		});
	});

	test("a new primary the agent trusts keeps the root trusted", async () => {
		const { db } = setup();
		const { projectId, previousPrimaryId, rootPath } = seedTrustedRoot(
			db,
			true,
		);

		await revokeRootTrustForNewPrimary(db, projectId, previousPrimaryId);

		expect(readState().projects[rootPath].hasTrustDialogAccepted).toBe(true);
	});
});

describe("revoking a folder's trust keeps the rest of the store", () => {
	test("codex drops only the folder's trust line and its emptied table", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			[
				'model = "o3"',
				'projects."/dotted".trust_level = "trusted"',
				"",
				'[projects."/a"]',
				'trust_level = "trusted"',
				"",
				'[projects."/root"]',
				'trust_level = "trusted"',
				"",
				'[projects."/kept"]',
				'trust_level = "trusted"',
				"# note",
				"",
			].join("\n"),
		);

		await revokeCodexFolderTrust(file, ["/root", "/dotted"]);

		expect(readFileSync(file, "utf-8")).toBe(
			[
				'model = "o3"',
				"",
				'[projects."/a"]',
				'trust_level = "trusted"',
				"",
				'[projects."/kept"]',
				'trust_level = "trusted"',
				"# note",
				"",
			].join("\n"),
		);
	});

	test("antigravity drops only the folder from trustedWorkspaces", async () => {
		const file = join(dir, "settings.json");
		writeFileSync(
			file,
			JSON.stringify({ trustedWorkspaces: ["/a", "/root"], other: 1 }),
		);

		await revokeAgyFolderTrust(file, ["/root"]);

		expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({
			trustedWorkspaces: ["/a"],
			other: 1,
		});
	});
});

describe("isCodexFolderTrusted", () => {
	test("reads trust_level from the project's table or a dotted key only", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			[
				'projects."/dotted".trust_level = "trusted"',
				'[projects."/a"]',
				'trust_level = "trusted"',
				"[projects.'/b']",
				'trust_level = "untrusted"',
				'[projects."/c"]',
				"[other]",
				'trust_level = "trusted"',
			].join("\n"),
		);

		expect(await isCodexFolderTrusted(file, ["/a"])).toBe(true);
		expect(await isCodexFolderTrusted(file, ["/dotted"])).toBe(true);
		expect(await isCodexFolderTrusted(file, ["/b"])).toBe(false);
		expect(await isCodexFolderTrusted(file, ["/c"])).toBe(false);
		expect(await isCodexFolderTrusted(join(dir, "none"), ["/a"])).toBe(false);
	});
});

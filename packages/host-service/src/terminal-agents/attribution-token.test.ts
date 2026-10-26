import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
	configureAttributionTokensForDatabase,
	issueAttributionToken,
	openAttributionTokenAuthority,
	verifyAttributionToken,
} from "./attribution-token";

test("attribution tokens authorize only their owning terminal", () => {
	const token = issueAttributionToken("terminal-a");
	expect(verifyAttributionToken("terminal-a", token)).toBe(true);
	expect(verifyAttributionToken("terminal-b", token)).toBe(false);
	for (const invalid of [
		undefined,
		"",
		"a".repeat(64),
		token.slice(1),
		"z".repeat(64),
	]) {
		expect(verifyAttributionToken("terminal-a", invalid)).toBe(false);
	}
});

test("private authority preserves its issued tokens across restart and isolates another host", () => {
	const root = mkdtempSync(join(tmpdir(), "native-attribution-"));
	try {
		const first = openAttributionTokenAuthority(join(root, "one")),
			token = first.issue("terminal");
		expect(
			openAttributionTokenAuthority(join(root, "one")).verify(
				"terminal",
				token,
			),
		).toBe(true);
		expect(
			openAttributionTokenAuthority(join(root, "two")).verify(
				"terminal",
				token,
			),
		).toBe(false);
		expect(
			openAttributionTokenAuthority(join(root, "one")).verify(
				"terminal",
				"b".repeat(64),
			),
		).toBe(false);
		expect(statSync(join(root, "one/key")).mode & 0o777).toBe(0o600);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
test("restart recovers a key publication interrupted after the hardlink without rotating its secret", () => {
	const root = mkdtempSync(join(tmpdir(), "native-key-publication-"));
	try {
		const directory = join(root, "authority");
		const moduleUrl = new URL("./attribution-token.ts", import.meta.url).href;
		const child = spawnSync(
			"node",
			[
				"--import",
				import.meta.resolve("tsx"),
				"--input-type=module",
				"-e",
				`
			import fs from "node:fs";
			import { syncBuiltinESMExports } from "node:module";
			const link = fs.linkSync;
			fs.linkSync = (...args) => { link(...args); process.exit(86); };
			syncBuiltinESMExports();
			const { openAttributionTokenAuthority } = await import(${JSON.stringify(moduleUrl)});
			openAttributionTokenAuthority(${JSON.stringify(directory)});
		`,
			],
			{
				cwd: import.meta.dir,
				encoding: "utf8",
				env: {
					PATH: process.env.PATH,
					HOME: root,
					CFFIXED_USER_HOME: root,
					TMPDIR: root,
					SUPERSET_HOME_DIR: join(root, "superset"),
					CLAUDE_CONFIG_DIR: join(root, "claude"),
					CODEX_HOME: join(root, "codex"),
				},
			},
		);
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(86);
		const key = join(directory, "key"),
			before = readFileSync(key);
		expect(statSync(key).nlink).toBe(2);
		const restarted = openAttributionTokenAuthority(directory);
		expect(readFileSync(key)).toEqual(before);
		expect(statSync(key).nlink).toBe(1);
		expect(readdirSync(directory)).toEqual(["key"]);
		expect(
			openAttributionTokenAuthority(directory).verify(
				"terminal",
				restarted.issue("terminal"),
			),
		).toBe(true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
test("key publication recovery refuses unrelated, multiple, permissive and corrupt aliases", () => {
	for (const kind of [
		"unrelated",
		"external",
		"multiple",
		"permissive",
		"corrupt",
		"symlink",
	]) {
		if (kind === "permissive" && process.platform === "win32") continue;
		const root = mkdtempSync(join(tmpdir(), "native-key-publication-"));
		try {
			const directory = join(root, "authority");
			openAttributionTokenAuthority(directory);
			const key = join(directory, "key"),
				before = readFileSync(key);
			const temporary = join(directory, `key.${randomUUID()}.tmp`);
			if (kind === "unrelated") linkSync(key, join(directory, "unrelated.tmp"));
			else if (kind === "external") linkSync(key, join(root, "external"));
			else {
				linkSync(key, temporary);
				if (kind === "multiple")
					linkSync(key, join(directory, `key.${randomUUID()}.tmp`));
				if (kind === "permissive") chmodSync(key, 0o644);
				if (kind === "corrupt") writeFileSync(key, "corrupt");
				if (kind === "symlink") {
					unlinkSync(key);
					symlinkSync(temporary, key);
				}
			}
			expect(() => openAttributionTokenAuthority(directory)).toThrow();
			if (kind !== "corrupt") expect(readFileSync(key)).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test("relative database filenames select the same persisted authority on a child restart, while injected and anonymous databases are exempt", () => {
	const root = mkdtempSync(join(tmpdir(), "native-relative-database-"));
	try {
		const database = join(root, "data", "host.db");
		mkdirSync(join(root, "data"));
		const path = relative(process.cwd(), database);
		const sqlite = new Database(path);
		sqlite.exec("CREATE TABLE synthetic_fixture (id INTEGER PRIMARY KEY)");
		sqlite.close();
		for (const anonymous of ["", ":memory:", " :memory: "])
			configureAttributionTokensForDatabase(anonymous);
		configureAttributionTokensForDatabase(database, true);
		expect(readdirSync(join(root, "data"))).toEqual(["host.db"]);
		configureAttributionTokensForDatabase(path);
		expect(readdirSync(join(root, "data"))).toContain(".native-attribution");
		const tokenHash = createHash("sha256")
			.update(issueAttributionToken("terminal"))
			.digest("hex");
		const moduleUrl = new URL("./attribution-token.ts", import.meta.url).href;
		const child = spawnSync(
			"node",
			[
				"--import",
				import.meta.resolve("tsx"),
				"--input-type=module",
				"-e",
				`
			import { createHash } from "node:crypto";
			const { configureAttributionTokensForDatabase, issueAttributionToken } = await import(${JSON.stringify(moduleUrl)});
			configureAttributionTokensForDatabase(${JSON.stringify(path)});
			console.log(createHash("sha256").update(issueAttributionToken("terminal")).digest("hex"));
		`,
			],
			{
				cwd: process.cwd(),
				encoding: "utf8",
				env: {
					PATH: process.env.PATH,
					HOME: root,
					CFFIXED_USER_HOME: root,
					TMPDIR: root,
					SUPERSET_HOME_DIR: join(root, "superset"),
					CLAUDE_CONFIG_DIR: join(root, "claude"),
					CODEX_HOME: join(root, "codex"),
				},
			},
		);
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(0);
		expect(child.stdout.trim()).toBe(tokenHash);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("unsafe attribution storage uses an isolated temporary authority without rotating the stored key", () => {
	const root = mkdtempSync(join(tmpdir(), "native-unavailable-authority-"));
	try {
		const moduleUrl = new URL("./attribution-token.ts", import.meta.url).href;
		const child = spawnSync(
			"node",
			[
				"--import",
				import.meta.resolve("tsx"),
				"--input-type=module",
				"-e",
				`
			import assert from "node:assert/strict";
			import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
			import { join } from "node:path";
			const { configureAttributionTokensForDatabase, issueAttributionToken, verifyAttributionToken } = await import(${JSON.stringify(moduleUrl)});
			const root = ${JSON.stringify(root)};
			const database = join(root, "host.db");
			configureAttributionTokensForDatabase(database);
			const prior = issueAttributionToken("owned");
			const key = join(root, ".native-attribution", "key");
			writeFileSync(key, "malformed");
			configureAttributionTokensForDatabase(database);
			const temporary = issueAttributionToken("owned");
			assert.equal(verifyAttributionToken("owned", prior), false);
			assert.equal(verifyAttributionToken("owned", temporary), true);
			assert.equal(verifyAttributionToken("other", temporary), false);
			assert.equal(readFileSync(key, "utf8"), "malformed");
			configureAttributionTokensForDatabase(database);
			assert.equal(verifyAttributionToken("owned", temporary), true);
			assert.throws(() => configureAttributionTokensForDatabase(join(root, "other", "host.db")), /scope changed/);
			assert.equal(verifyAttributionToken("owned", temporary), true);
			`,
			],
			{
				encoding: "utf8",
				env: {
					PATH: process.env.PATH,
					HOME: root,
					CFFIXED_USER_HOME: root,
					TMPDIR: root,
				},
			},
		);
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(0);
		expect(child.stderr).toContain("host-scoped temporary authority");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

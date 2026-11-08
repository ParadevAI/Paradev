import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	resetManagedEnvForTests,
	setManagedEnv,
} from "../runtime/sandbox-managed-env";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../terminal/env";
import { setDefaultAccountSelection } from "../trpc/router/usage/default-account";
import { buildChatAgentEnv } from "./agentEnv";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const PERSONAL = "00000000-0000-0000-0000-0000000000c1";

function createTestDb(): HostDb {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("buildChatAgentEnv", () => {
	// setDefaultAccountSelection publishes pointer files under SUPERSET_HOME_DIR.
	let previousHome: string | undefined;
	let previousRunMode: string | undefined;
	let home = "";
	const defaultDir = tmpdir();

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		previousRunMode = process.env.SUPERSET_HOST_RUN_MODE;
		process.env.SUPERSET_HOST_RUN_MODE = "local";
		home = mkdtempSync(join(tmpdir(), "chat-agent-env-"));
		process.env.SUPERSET_HOME_DIR = home;
		initTerminalBaseEnv({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ambient" });
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		if (previousRunMode === undefined)
			delete process.env.SUPERSET_HOST_RUN_MODE;
		else process.env.SUPERSET_HOST_RUN_MODE = previousRunMode;
		resetManagedEnvForTests();
		rmSync(home, { recursive: true, force: true });
		resetTerminalBaseEnvForTests();
	});

	function seed(db: HostDb) {
		setDefaultAccountSelection(db, "claude", defaultDir);
		db.insert(schema.hostAgentConfigs)
			.values({
				id: PERSONAL,
				presetId: "custom",
				label: "Claude (personal)",
				command: "claude",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				envJson: JSON.stringify({
					CLAUDE_CONFIG_DIR: "/profiles/personal",
					ANTHROPIC_API_KEY: "sk-own",
				}),
				displayOrder: 1,
			})
			.run();
	}

	const build = (db: HostDb, agentConfigId?: string, presetId = "claude") =>
		buildChatAgentEnv({
			db,
			cwd: home,
			workspaceId: "missing-workspace",
			presetId,
			...(agentConfigId ? { agentConfigId } : {}),
		});

	it("runs a chat without an agent config on the default account", async () => {
		const db = createTestDb();
		seed(db);
		const env = await build(db);
		expect(env.CLAUDE_CONFIG_DIR).toBe(defaultDir);
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
	});

	it("lets the chat's agent config env beat the default account", async () => {
		const db = createTestDb();
		seed(db);
		const env = await build(db, PERSONAL);
		expect(env.CLAUDE_CONFIG_DIR).toBe("/profiles/personal");
		expect(env.SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR).toBe(defaultDir);
		expect(env.ANTHROPIC_API_KEY).toBe("sk-own");
	});

	it("falls back to the default account when the config is gone", async () => {
		const db = createTestDb();
		seed(db);
		const env = await build(db, "00000000-0000-0000-0000-0000000000ff");
		expect(env.CLAUDE_CONFIG_DIR).toBe(defaultDir);
	});

	it("ignores a config that now runs another CLI", async () => {
		const db = createTestDb();
		seed(db);
		const env = await build(db, PERSONAL, "codex");
		expect(env.CLAUDE_CONFIG_DIR).toBe(defaultDir);
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
	});

	it("drops the sandbox sign-in when the config brings its own key", async () => {
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		await setManagedEnv({});
		initTerminalBaseEnv({
			PATH: "/usr/bin",
			ANTHROPIC_AUTH_TOKEN: "sandbox-token",
		});
		const db = createTestDb();
		seed(db);
		expect((await build(db)).ANTHROPIC_AUTH_TOKEN).toBe("sandbox-token");
		const env = await build(db, PERSONAL);
		expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(env.ANTHROPIC_API_KEY).toBe("sk-own");
	});
});

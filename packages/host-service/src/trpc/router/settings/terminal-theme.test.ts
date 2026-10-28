import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { getHostTerminalTheme } from "../../../terminal/host-terminal-theme";
import type { HostServiceContext } from "../../../types";
import { terminalThemeRouter } from "./terminal-theme";
import { getHostWorktreeBaseDir } from "./worktree-location";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const LEGACY_WORKTREE_BASE_DIR_ENV = "SUPERSET_LEGACY_WORKTREE_BASE_DIR";
const previousLegacyDir = process.env[LEGACY_WORKTREE_BASE_DIR_ENV];

const lightColors = {
	foreground: "#1a1a1a",
	background: "#fafafa",
	cursor: "#1a1a1a",
};

function createContext() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return { db, isAuthenticated: true } as unknown as HostServiceContext & {
		db: HostDb;
	};
}

afterEach(() => {
	if (previousLegacyDir === undefined) {
		delete process.env[LEGACY_WORKTREE_BASE_DIR_ENV];
	} else {
		process.env[LEGACY_WORKTREE_BASE_DIR_ENV] = previousLegacyDir;
	}
});

describe("terminalThemeRouter.set", () => {
	it("stores the theme that theme-less terminal creates fall back to", async () => {
		const ctx = createContext();
		await terminalThemeRouter
			.createCaller(ctx)
			.set({ themeType: "light", colors: lightColors });

		expect(getHostTerminalTheme(ctx.db)).toEqual({
			themeType: "light",
			colors: lightColors,
		});
	});

	it("keeps the legacy worktree dir on a host whose first write is the theme", async () => {
		process.env[LEGACY_WORKTREE_BASE_DIR_ENV] = "/legacy/worktrees";
		const ctx = createContext();
		await terminalThemeRouter.createCaller(ctx).set({ themeType: "dark" });

		expect(getHostWorktreeBaseDir(ctx)).toBe("/legacy/worktrees");
	});
});

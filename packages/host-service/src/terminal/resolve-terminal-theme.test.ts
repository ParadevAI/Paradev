import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db/db";
import * as schema from "../db/schema";
import {
	getHostTerminalTheme,
	terminalThemeRouter,
} from "../trpc/router/settings/terminal-theme";
import type { HostServiceContext } from "../types";
import { resolveTerminalTheme } from "./resolve-terminal-theme";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

const lightColors = {
	foreground: "#1a1a1a",
	background: "#fafafa",
	cursor: "#1a1a1a",
};
const darkColors = {
	foreground: "#eeeeee",
	background: "#101010",
	cursor: "#eeeeee",
};

function createDb() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("resolveTerminalTheme", () => {
	it("gives a request with no theme the theme the desktop pushed to the host", async () => {
		const db = createDb();
		const ctx = { db, isAuthenticated: true } as unknown as HostServiceContext;
		await terminalThemeRouter
			.createCaller(ctx)
			.set({ themeType: "light", colors: lightColors });

		const resolved = resolveTerminalTheme({
			hostTheme: getHostTerminalTheme(db),
		});

		expect(resolved).toEqual({ themeType: "light", colors: lightColors });
	});

	it("falls back to dark on a host no desktop has pushed to", () => {
		expect(resolveTerminalTheme({ hostTheme: null })).toEqual({
			themeType: undefined,
			colors: undefined,
		});
	});

	it("keeps an explicit theme and drops host colors of the other kind", () => {
		const hostTheme = { themeType: "light" as const, colors: lightColors };
		expect(resolveTerminalTheme({ themeType: "dark", hostTheme })).toEqual({
			themeType: "dark",
			colors: undefined,
		});
		expect(resolveTerminalTheme({ colors: darkColors, hostTheme })).toEqual({
			themeType: "dark",
			colors: darkColors,
		});
	});
});

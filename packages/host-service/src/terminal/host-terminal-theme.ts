import {
	type TerminalColors,
	terminalColorsSchema,
} from "@superset/shared/terminal-colors";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../db/index.ts";
import { hostSettings } from "../db/schema.ts";

const HOST_SETTINGS_ID = 1;

export const terminalThemeTypeSchema = z.enum(["dark", "light"]);

export type TerminalThemeType = z.infer<typeof terminalThemeTypeSchema>;

export interface HostTerminalTheme {
	themeType: TerminalThemeType;
	colors?: TerminalColors;
}

export function getHostTerminalTheme(db: HostDb): HostTerminalTheme | null {
	const row = db
		.select({
			themeType: hostSettings.terminalThemeType,
			colors: hostSettings.terminalColors,
		})
		.from(hostSettings)
		.where(eq(hostSettings.id, HOST_SETTINGS_ID))
		.get();
	const themeType = terminalThemeTypeSchema.safeParse(row?.themeType);
	if (!themeType.success) return null;
	const colors = terminalColorsSchema.safeParse(row?.colors);
	return {
		themeType: themeType.data,
		...(colors.success ? { colors: colors.data } : {}),
	};
}

export function setHostTerminalTheme(
	db: HostDb,
	theme: HostTerminalTheme,
): void {
	const values = {
		terminalThemeType: theme.themeType,
		terminalColors: theme.colors ?? null,
	};
	db.insert(hostSettings)
		.values({ id: HOST_SETTINGS_ID, ...values })
		.onConflictDoUpdate({ target: hostSettings.id, set: values })
		.run();
}

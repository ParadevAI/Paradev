import {
	type TerminalColors,
	terminalColorsSchema,
} from "@superset/shared/terminal-colors";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db/db";
import { hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";

const HOST_SETTINGS_ID = 1;

export type TerminalThemeType = "dark" | "light";

export interface HostTerminalTheme {
	themeType: TerminalThemeType;
	colors?: TerminalColors;
}

const terminalThemeTypeSchema = z.enum(["dark", "light"]);

/**
 * The desktop's resolved terminal theme, or null on a host no desktop has
 * pushed to yet (headless, cloud, or a fresh install).
 */
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

export const terminalThemeRouter = router({
	get: protectedProcedure.query(({ ctx }) => getHostTerminalTheme(ctx.db)),

	set: protectedProcedure
		.input(
			z.object({
				themeType: terminalThemeTypeSchema,
				colors: terminalColorsSchema.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const values = {
				terminalThemeType: input.themeType,
				terminalColors: input.colors ?? null,
			};
			ctx.db
				.insert(hostSettings)
				.values({ id: HOST_SETTINGS_ID, ...values })
				.onConflictDoUpdate({ target: hostSettings.id, set: values })
				.run();
			return { success: true as const };
		}),
});

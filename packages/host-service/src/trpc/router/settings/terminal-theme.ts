import { terminalColorsSchema } from "@superset/shared/terminal-colors";
import { z } from "zod";
import {
	setHostTerminalTheme,
	terminalThemeTypeSchema,
} from "../../../terminal/host-terminal-theme";
import { protectedProcedure, router } from "../../index";
import { getHostWorktreeBaseDir } from "./worktree-location";

export const terminalThemeRouter = router({
	set: protectedProcedure
		.input(
			z.object({
				themeType: terminalThemeTypeSchema,
				colors: terminalColorsSchema.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			// Seeds the settings row (and the legacy worktree dir) before this write creates it.
			getHostWorktreeBaseDir(ctx);
			setHostTerminalTheme(ctx.db, input);
			return { success: true as const };
		}),
});

import { db } from "@superset/db/client";
import { userSettings } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import {
	DEFAULT_USER_SETTINGS,
	loadUserSettings,
} from "../../lib/user-settings";
import { protectedProcedure } from "../../trpc";

export const userSettingsRouter = {
	get: protectedProcedure.query(({ ctx }) =>
		loadUserSettings(ctx.session.user.id),
	),

	update: protectedProcedure
		.input(z.object({ experimentalChat: z.boolean().optional() }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const set = Object.fromEntries(
				Object.entries(input).filter(([, value]) => value !== undefined),
			) as Partial<typeof DEFAULT_USER_SETTINGS>;
			if (Object.keys(set).length > 0) {
				await db
					.insert(userSettings)
					.values({ ...DEFAULT_USER_SETTINGS, ...set, userId })
					.onConflictDoUpdate({ target: userSettings.userId, set });
			}
			return loadUserSettings(userId);
		}),
} satisfies TRPCRouterRecord;

import { db } from "@superset/db/client";
import { userSettings } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import {
	DEFAULT_USER_SETTINGS,
	loadUserSettings,
	MAX_NAMING_INSTRUCTIONS_LENGTH,
	type UserSettings,
} from "../../lib/user-settings";
import { personProcedure } from "../../trpc";

export const userSettingsRouter = {
	get: personProcedure.query(({ ctx }) =>
		loadUserSettings(ctx.session.user.id),
	),

	update: personProcedure
		.input(
			z.object({
				experimentalChat: z.boolean().optional(),
				namingInstructions: z
					.string()
					.max(MAX_NAMING_INSTRUCTIONS_LENGTH)
					.nullable()
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const set: Partial<UserSettings> = {};
			if (input.experimentalChat !== undefined) {
				set.experimentalChat = input.experimentalChat;
			}
			if (input.namingInstructions !== undefined) {
				set.namingInstructions = input.namingInstructions?.trim() || null;
			}
			if (Object.keys(set).length > 0) {
				await db
					.insert(userSettings)
					.values({ ...DEFAULT_USER_SETTINGS, ...set, userId })
					.onConflictDoUpdate({ target: userSettings.userId, set });
			}
			return loadUserSettings(userId);
		}),
} satisfies TRPCRouterRecord;

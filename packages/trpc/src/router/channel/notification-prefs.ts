import { db } from "@superset/db/client";
import { channelNotificationPrefs } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { DEFAULT_NOTIFY_PREFS, type NotifyPrefs } from "./notify-rules";
import { updateNotificationPrefsSchema } from "./schema";

export async function loadNotifyPrefs(
	userIds: readonly string[],
): Promise<Map<string, NotifyPrefs>> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return new Map();
	const rows = await db
		.select()
		.from(channelNotificationPrefs)
		.where(inArray(channelNotificationPrefs.userId, unique));
	return new Map(
		rows.map(({ userId, updatedAt: _updatedAt, ...prefs }) => [userId, prefs]),
	);
}

async function prefsFor(userId: string): Promise<NotifyPrefs> {
	return (await loadNotifyPrefs([userId])).get(userId) ?? DEFAULT_NOTIFY_PREFS;
}

export const channelNotificationPrefsRouter = {
	get: protectedProcedure.query(({ ctx }) => prefsFor(ctx.session.user.id)),

	update: protectedProcedure
		.input(updateNotificationPrefsSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const set = Object.fromEntries(
				Object.entries({
					...input,
					keywords: input.keywords?.map((k) => k.trim()).filter(Boolean),
				}).filter(([, value]) => value !== undefined),
			) as Partial<NotifyPrefs>;
			await db
				.insert(channelNotificationPrefs)
				.values({ ...DEFAULT_NOTIFY_PREFS, ...set, userId })
				.onConflictDoUpdate({ target: channelNotificationPrefs.userId, set });
			return prefsFor(userId);
		}),
} satisfies TRPCRouterRecord;

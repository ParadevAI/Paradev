import { db } from "@superset/db/client";
import { userSettings } from "@superset/db/schema";
import { eq } from "drizzle-orm";

export interface UserSettings {
	experimentalChat: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = { experimentalChat: false };

export async function loadUserSettings(userId: string): Promise<UserSettings> {
	const row = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
		columns: { experimentalChat: true },
	});
	return row ?? DEFAULT_USER_SETTINGS;
}

export async function acpChatEnabled(userId: string): Promise<boolean> {
	return (await loadUserSettings(userId)).experimentalChat;
}

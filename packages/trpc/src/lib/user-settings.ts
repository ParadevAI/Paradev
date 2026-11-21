import { db } from "@superset/db/client";
import { userSettings } from "@superset/db/schema";
import { eq } from "drizzle-orm";

export interface UserSettings {
	experimentalChat: boolean;
	namingInstructions: string | null;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
	experimentalChat: false,
	namingInstructions: null,
};

export const MAX_NAMING_INSTRUCTIONS_LENGTH = 2000;

export async function loadUserSettings(userId: string): Promise<UserSettings> {
	const row = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, userId),
		columns: { experimentalChat: true, namingInstructions: true },
	});
	return row ?? DEFAULT_USER_SETTINGS;
}

export async function acpChatEnabled(userId: string): Promise<boolean> {
	return (await loadUserSettings(userId)).experimentalChat;
}

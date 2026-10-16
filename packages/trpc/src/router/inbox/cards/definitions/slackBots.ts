import {
	connectionBotToken,
	orgConnections,
} from "../../../../lib/connectors/lookup";

/**
 * The organization's Slack app tokens, one per workspace it connected. Every
 * member who connects Slack gets a row carrying the same app install, so the
 * newest row of each workspace speaks for its bot.
 */
export async function slackBots(
	organizationId: string,
): Promise<Map<string, string>> {
	const rows = await orgConnections(organizationId, "slack");
	const bots = new Map<string, string>();
	for (const row of rows) {
		if (bots.has(row.externalAccountId)) continue;
		const token = await connectionBotToken(row).catch(() => null);
		if (token) bots.set(row.externalAccountId, token);
	}
	return bots;
}

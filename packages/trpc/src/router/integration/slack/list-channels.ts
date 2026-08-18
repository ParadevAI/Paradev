/**
 * The channels a Slack bot token can see, for the trigger editor's channel
 * picker.
 *
 * A direct call rather than `@slack/web-api`: this package does not depend on
 * it, and one paginated GET does not justify adding it. Public and private
 * channels both — a private channel the bot has been invited to is where "a
 * message in #incidents" most often means something.
 */

type ConversationsListResponse = {
	ok: boolean;
	error?: string;
	channels?: Array<{ id?: string; name?: string; is_archived?: boolean }>;
	response_metadata?: { next_cursor?: string };
};

/** Enough for any workspace this is likely to be pointed at; a hard stop, not a page size. */
const MAX_PAGES = 10;

export async function listSlackChannels(
	accessToken: string,
): Promise<Array<{ id: string; name: string }>> {
	const channels: Array<{ id: string; name: string }> = [];
	let cursor: string | undefined;

	for (let page = 0; page < MAX_PAGES; page++) {
		const params = new URLSearchParams({
			types: "public_channel,private_channel",
			exclude_archived: "true",
			limit: "200",
		});
		if (cursor) params.set("cursor", cursor);

		let data: ConversationsListResponse;
		try {
			const response = await fetch(
				`https://slack.com/api/conversations.list?${params.toString()}`,
				{
					headers: { Authorization: `Bearer ${accessToken}` },
					signal: AbortSignal.timeout(5_000),
				},
			);
			data = (await response.json()) as ConversationsListResponse;
		} catch (error) {
			// Slack unreachable or answering with something other than JSON: the
			// picker shows what was fetched so far rather than the query failing.
			console.error("[slack/listChannels] conversations.list failed:", error);
			return channels;
		}
		if (!data.ok) {
			// `missing_scope` until the app is reinstalled with channels:read; an
			// empty picker is the honest state, not an error the editor can act on.
			console.error(
				"[slack/listChannels] conversations.list failed:",
				data.error,
			);
			return channels;
		}
		for (const channel of data.channels ?? []) {
			if (channel.id && channel.name) {
				channels.push({ id: channel.id, name: channel.name });
			}
		}
		cursor = data.response_metadata?.next_cursor || undefined;
		if (!cursor) break;
	}

	return channels.sort((a, b) => a.name.localeCompare(b.name));
}

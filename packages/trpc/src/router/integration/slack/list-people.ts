/**
 * The workspace's human members, for the trigger editor's people picker. Keyed
 * by Slack user id — what an event's `user` carries and the matcher compares
 * against. Same direct-fetch shape as `listSlackChannels`.
 */

type UsersListResponse = {
	ok: boolean;
	error?: string;
	members?: Array<{
		id?: string;
		name?: string;
		real_name?: string;
		deleted?: boolean;
		is_bot?: boolean;
	}>;
	response_metadata?: { next_cursor?: string };
};

const PAGE_SIZE = 200;
const MAX_PEOPLE = 1000;

export async function listSlackPeople(
	accessToken: string,
): Promise<Array<{ id: string; label: string }>> {
	const people: Array<{ id: string; label: string }> = [];
	let cursor: string | undefined;

	while (people.length < MAX_PEOPLE) {
		const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
		if (cursor) params.set("cursor", cursor);

		let data: UsersListResponse;
		try {
			const response = await fetch(
				`https://slack.com/api/users.list?${params.toString()}`,
				{
					headers: { Authorization: `Bearer ${accessToken}` },
					signal: AbortSignal.timeout(5_000),
				},
			);
			data = (await response.json()) as UsersListResponse;
		} catch (error) {
			console.error("[slack/listPeople] users.list failed:", error);
			break;
		}
		if (!data.ok) {
			// `missing_scope` until the app is reinstalled with users:read; an empty
			// picker is the honest state, not an error the editor can act on.
			console.error("[slack/listPeople] users.list failed:", data.error);
			break;
		}
		for (const member of data.members ?? []) {
			if (!member.id || member.deleted || member.is_bot) continue;
			if (member.id === "USLACKBOT") continue;
			const label = member.real_name || member.name;
			if (label) people.push({ id: member.id, label });
		}
		cursor = data.response_metadata?.next_cursor || undefined;
		if (!cursor) break;
	}

	return people.sort((a, b) => a.label.localeCompare(b.label));
}

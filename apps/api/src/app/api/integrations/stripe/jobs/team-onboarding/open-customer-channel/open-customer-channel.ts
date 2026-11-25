import type { WebClient } from "@slack/web-api";

export interface CustomerChannelClient {
	conversations: Pick<
		WebClient["conversations"],
		"create" | "list" | "invite" | "inviteShared"
	>;
	chat: Pick<WebClient["chat"], "postMessage">;
}

export type CustomerInvite =
	| { status: "sent"; email: string }
	| { status: "no_email" }
	| { status: "failed"; email: string; error: string };

export interface CustomerChannelResult {
	channelId: string;
	created: boolean;
	teammatesInvited: number;
	teammateInviteError: string | null;
	customerInvite: CustomerInvite;
}

function slackErrorCode(error: unknown): string {
	const code = (error as { data?: { error?: unknown } } | null)?.data?.error;
	if (typeof code === "string") return code;
	return error instanceof Error ? error.message : "unknown_error";
}

async function findChannelByName(
	client: CustomerChannelClient,
	name: string,
): Promise<string | null> {
	let cursor: string | undefined;
	do {
		const page = await client.conversations.list({
			types: "public_channel,private_channel",
			exclude_archived: true,
			limit: 1000,
			cursor,
		});
		const match = page.channels?.find((channel) => channel.name === name);
		if (match?.id) return match.id;
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return null;
}

async function createOrFindChannel(
	client: CustomerChannelClient,
	name: string,
): Promise<{ id: string; created: boolean }> {
	try {
		const response = await client.conversations.create({ name });
		const id = response.channel?.id;
		if (!id) throw new Error("conversations.create returned no channel id");
		return { id, created: true };
	} catch (error) {
		if (slackErrorCode(error) !== "name_taken") throw error;
		const id = await findChannelByName(client, name);
		if (!id) {
			throw new Error(
				`#${name} is taken but not visible to the bot (archived, or private without the bot)`,
			);
		}
		return { id, created: false };
	}
}

export async function openCustomerChannel({
	client,
	name,
	teammateIds,
	customerEmail,
	welcomeText,
}: {
	client: CustomerChannelClient;
	name: string;
	teammateIds: string[];
	customerEmail: string | null;
	welcomeText: string;
}): Promise<CustomerChannelResult> {
	const channel = await createOrFindChannel(client, name);

	let teammateInviteError: string | null = null;
	if (teammateIds.length > 0) {
		try {
			await client.conversations.invite({
				channel: channel.id,
				users: teammateIds.join(","),
				force: true,
			});
		} catch (error) {
			const code = slackErrorCode(error);
			if (code !== "already_in_channel") teammateInviteError = code;
		}
	}

	let customerInvite: CustomerInvite = { status: "no_email" };
	if (customerEmail) {
		try {
			await client.conversations.inviteShared({
				channel: channel.id,
				emails: [customerEmail],
			});
			customerInvite = { status: "sent", email: customerEmail };
		} catch (error) {
			customerInvite = {
				status: "failed",
				email: customerEmail,
				error: slackErrorCode(error),
			};
		}
	}

	if (channel.created) {
		await client.chat.postMessage({ channel: channel.id, text: welcomeText });
	}

	return {
		channelId: channel.id,
		created: channel.created,
		teammatesInvited: teammateInviteError ? 0 : teammateIds.length,
		teammateInviteError,
		customerInvite,
	};
}

import { GMAIL_WATCH_TTL_MS } from "./constants";
import { GoogleApiError, googleFetch } from "./refresh";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailLabel = {
	id: string;
	name: string;
	type?: "system" | "user" | string;
};

export type GmailHeader = { name: string; value: string };

export type GmailMessagePart = {
	partId?: string;
	mimeType?: string;
	filename?: string;
	headers?: GmailHeader[];
	body?: { attachmentId?: string; size?: number; data?: string };
	parts?: GmailMessagePart[];
};

export type GmailMessage = {
	id: string;
	threadId: string;
	labelIds?: string[];
	snippet?: string;
	historyId?: string;
	internalDate?: string;
	sizeEstimate?: number;
	payload?: GmailMessagePart;
};

export async function listLabels(connectionId: string): Promise<GmailLabel[]> {
	const result = await googleFetch<{ labels?: GmailLabel[] }>(
		connectionId,
		`${GMAIL_API}/labels`,
	);
	return result.labels ?? [];
}

export async function getProfile(
	connectionId: string,
): Promise<{ emailAddress: string; historyId: string }> {
	return googleFetch(connectionId, `${GMAIL_API}/profile`);
}

/**
 * Message ids added since `startHistoryId`, and the mailbox's current history
 * id to continue from. `expired` when Google no longer holds history that far
 * back (a week or so): the caller resets from the profile and accepts the gap.
 */
export async function listAddedMessages(
	connectionId: string,
	startHistoryId: string,
): Promise<
	| { expired: true }
	| {
			expired: false;
			historyId: string;
			messages: Array<{ id: string; threadId: string; labelIds: string[] }>;
	  }
> {
	const byId = new Map<
		string,
		{ id: string; threadId: string; labelIds: string[] }
	>();
	let pageToken: string | undefined;
	let historyId: string | undefined;
	do {
		const params = new URLSearchParams({
			startHistoryId,
			historyTypes: "messageAdded",
			maxResults: "500",
		});
		if (pageToken) params.set("pageToken", pageToken);
		let page: {
			history?: Array<{
				messagesAdded?: Array<{
					message?: { id?: string; threadId?: string; labelIds?: string[] };
				}>;
			}>;
			historyId?: string;
			nextPageToken?: string;
		};
		try {
			page = await googleFetch(connectionId, `${GMAIL_API}/history?${params}`);
		} catch (error) {
			if (error instanceof GoogleApiError && error.status === 404) {
				return { expired: true };
			}
			throw error;
		}
		for (const record of page.history ?? []) {
			for (const added of record.messagesAdded ?? []) {
				const message = added.message;
				if (!message?.id || !message.threadId) continue;
				// The same message can appear in several records as labels
				// change; the last record's labels are the current ones.
				byId.set(message.id, {
					id: message.id,
					threadId: message.threadId,
					labelIds: message.labelIds ?? [],
				});
			}
		}
		historyId = page.historyId ?? historyId;
		pageToken = page.nextPageToken;
	} while (pageToken);
	if (!historyId) {
		throw new Error("Gmail history.list returned no history id");
	}
	return { expired: false, historyId, messages: [...byId.values()] };
}

/**
 * `format=full` is the only format that carries the MIME tree, which is where
 * attachments show; the field mask then leaves the body data itself out, so
 * what crosses the wire is headers, labels and part metadata. Four levels of
 * parts covers ordinary multipart mail; anything deeper simply reports no
 * attachment.
 */
const MESSAGE_FIELDS = (() => {
	let parts = "mimeType,filename,body(attachmentId,size)";
	for (let depth = 0; depth < 4; depth += 1) {
		parts = `mimeType,filename,body(attachmentId,size),parts(${parts})`;
	}
	return `id,threadId,labelIds,historyId,internalDate,sizeEstimate,payload(headers,${parts})`;
})();

/** Null when the message was deleted between the history record and now. */
export async function getMessage(
	connectionId: string,
	messageId: string,
): Promise<GmailMessage | null> {
	try {
		const params = new URLSearchParams({
			format: "full",
			fields: MESSAGE_FIELDS,
		});
		return await googleFetch<GmailMessage>(
			connectionId,
			`${GMAIL_API}/messages/${encodeURIComponent(messageId)}?${params}`,
		);
	} catch (error) {
		if (error instanceof GoogleApiError && error.status === 404) return null;
		throw error;
	}
}

/**
 * Asks Gmail to publish `{emailAddress, historyId}` to the topic on every
 * mailbox change. Lasts a week at most and never renews itself.
 */
export async function watchMailbox(
	connectionId: string,
	topicName: string,
): Promise<{ historyId: string; expiration: number }> {
	const result = await googleFetch<{ historyId: string; expiration?: string }>(
		connectionId,
		`${GMAIL_API}/watch`,
		{ method: "POST", body: JSON.stringify({ topicName }) },
	);
	return {
		historyId: result.historyId,
		expiration: Number(result.expiration ?? Date.now() + GMAIL_WATCH_TTL_MS),
	};
}

export async function stopMailboxWatch(connectionId: string): Promise<void> {
	await googleFetch<undefined>(connectionId, `${GMAIL_API}/stop`, {
		method: "POST",
	});
}

export function headerValue(
	message: GmailMessage,
	name: string,
): string | null {
	const wanted = name.toLowerCase();
	const header = message.payload?.headers?.find(
		(h) => h.name.toLowerCase() === wanted,
	);
	return header?.value ?? null;
}

/**
 * The bare addresses in a header like `"Ada" <ada@acme.com>, bob@acme.com`,
 * lower-cased. Display names are dropped; matching is on the address.
 */
export function parseAddresses(header: string | null): string[] {
	if (!header) return [];
	const found = header.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
	return [...new Set(found.map((address) => address.toLowerCase()))];
}

/** A part with a filename or an attachment id is an attachment. */
export function messageHasAttachment(message: GmailMessage): boolean {
	const walk = (part: GmailMessagePart | undefined): boolean => {
		if (!part) return false;
		if (part.filename || part.body?.attachmentId) return true;
		return (part.parts ?? []).some(walk);
	};
	return walk(message.payload);
}

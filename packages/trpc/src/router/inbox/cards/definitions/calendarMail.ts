import { encodeRaw } from "../../../../lib/gmail/mime";
import type { CardContext } from "../types";
import { gmailFor } from "./gmailClient";

/** Past this many guests a note stops being a note and becomes a mass mailing. */
export const NOTE_RECIPIENTS_MAX = 50;

export async function canMailNote(ctx: CardContext): Promise<boolean> {
	const gmail = await gmailFor(ctx.organizationId, ctx.readerId).catch(
		() => null,
	);
	return Boolean(gmail?.canSend);
}

/**
 * Google Calendar's API carries no message with an update, a cancellation or
 * a proposal, as its own dialogs do. The reader's words go as an email from
 * their Gmail instead; `hidden` puts the guests on Bcc for an event that
 * hides its guest list. False when nothing was sent.
 */
export async function mailNote(
	ctx: CardContext,
	note: { to: string[]; hidden?: boolean; subject: string; text: string },
): Promise<boolean> {
	if (note.to.length === 0 || note.to.length > NOTE_RECIPIENTS_MAX)
		return false;
	if (!note.text.trim()) return false;
	const gmail = await gmailFor(ctx.organizationId, ctx.readerId).catch(
		() => null,
	);
	if (!gmail?.canSend) return false;
	await gmail.client.users.messages.send({
		userId: "me",
		requestBody: {
			raw: encodeRaw({
				to: note.hidden ? [] : note.to,
				cc: [],
				bcc: note.hidden ? note.to : [],
				subject: note.subject,
				body: note.text,
				attachments: [],
			}),
		},
	});
	return true;
}

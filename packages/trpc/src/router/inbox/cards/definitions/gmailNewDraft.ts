import { encodeRaw } from "../../../../lib/gmail/mime";
import { type CardContext, CardUnavailable } from "../types";
import { CONNECT_GOOGLE, gmailFor } from "./gmailClient";

/** The reader's Gmail address when a draft can be made there; null when Gmail is not connected for them. */
export async function draftsAs(ctx: CardContext): Promise<string | null> {
	const gmail = await gmailFor(ctx.organizationId, ctx.readerId).catch(
		() => null,
	);
	if (!gmail?.canSend) return null;
	const profile = await gmail.client.users
		.getProfile({ userId: "me" })
		.catch(() => null);
	return profile?.data.emailAddress ?? null;
}

/** Leaves a draft in the reader's Gmail; nothing is sent. */
export async function createDraft(
	ctx: CardContext,
	mail: { to: string[]; subject: string; text: string },
): Promise<{ id: string; url: string }> {
	const gmail = await gmailFor(ctx.organizationId, ctx.readerId).catch(
		() => null,
	);
	if (!gmail?.canSend)
		throw new CardUnavailable(
			"no_connector",
			"Connect Gmail to make this draft",
			CONNECT_GOOGLE,
		);
	const created = await gmail.client.users.drafts
		.create({
			userId: "me",
			requestBody: {
				message: {
					raw: encodeRaw({
						to: mail.to,
						cc: [],
						bcc: [],
						subject: mail.subject,
						body: mail.text,
						attachments: [],
					}),
				},
			},
		})
		.catch(() => {
			throw new CardUnavailable("error", "Gmail did not make the draft");
		});
	const message = created.data.message?.id;
	return {
		id: created.data.id ?? "",
		url: `https://mail.google.com/mail/#drafts${message ? `?compose=${message}` : ""}`,
	};
}

import type { GmailEmailView, GmailMessageView, Resolved } from "./types";

/** Made-up emails shaped like real ones; realThreads/ holds threads captured from Gmail with the people renamed. */

const minutesAgo = (minutes: number) =>
	new Date(Date.now() - minutes * 60_000).toISOString();

export const me = { name: "Satya Patel", email: "satya@superset.sh" };
export const sendAs = [
	{
		email: me.email,
		name: me.name,
		isDefault: true,
		signature: "<div>Satya Patel<br>Superset</div>",
	},
];
export const avery = { name: "Avery Chen", email: "avery@lumenlabs.io" };
export const priya = { name: "Priya Raman", email: "priya.raman@northwind.co" };
export const jordan = {
	name: "Jordan Okafor",
	email: "jordan@okafor.example.com",
};

export function message(
	fields: Partial<GmailMessageView> & Pick<GmailMessageView, "id">,
): GmailMessageView {
	return {
		from: me,
		to: [],
		cc: [],
		bcc: [],
		date: minutesAgo(30),
		snippet: "",
		unread: false,
		starred: false,
		html: null,
		clipped: false,
		text: null,
		attachments: [],
		...fields,
	};
}

const newsletterHtml = `<table width="100%" bgcolor="#f6f1e7" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="560" bgcolor="#ffffff" cellpadding="24" style="font-family:Helvetica,Arial,sans-serif;border-radius:12px;margin:24px 0">
<tr><td><h1 style="margin:0;color:#0b3d2e;font-size:28px">This week at the market</h1>
<p style="color:#4a4a4a;font-size:15px;line-height:22px">Strawberries are back, and the bakery has a new sourdough. Order by Thursday for weekend delivery.</p>
<p><a href="https://example.com/shop" style="display:inline-block;background:#0b3d2e;color:#fff;padding:12px 20px;border-radius:24px;text-decoration:none;font-weight:bold">Shop the market</a></p>
<p style="color:#9a9a9a;font-size:12px">You are getting this because you subscribed. <a href="https://example.com/unsubscribe" style="color:#9a9a9a">Unsubscribe</a></p>
</td></tr></table></td></tr></table>`;

export const newsletter = message({
	id: "n1",
	from: { name: "Corner Market", email: "hello@market.example.com" },
	to: [me],
	date: minutesAgo(60 * 50),
	snippet: "Strawberries are back, and the bakery has a new sourdough.",
	html: newsletterHtml,
});

export const forward = message({
	id: "f1",
	from: jordan,
	to: [me],
	date: minutesAgo(20),
	snippet:
		"Satya, they finally have the dark chocolate trail mix again. Can you add two bags to the grocery order for the drive?",
	html: `<div dir="ltr">Satya, they finally have the dark chocolate trail mix again. Can you add two bags to the grocery order for the drive?<br><br>Thanks!<br>Jordan<br><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong>Corner Market</strong> &lt;hello@market.example.com&gt;<br>Subject: This week at the market<br></div><br>${newsletterHtml}</div></div>`,
});

export const actions: Resolved["actions"] = [
	{
		id: "send",
		label: "Send",
		style: "primary",
		role: "primary",
		input: "JSON",
	},
	{
		id: "compose",
		label: "Send new email",
		style: "secondary",
		role: "other",
		input: "JSON",
	},
	{ id: "archive", label: "Archive", style: "secondary", role: "other" },
	{
		id: "discard",
		label: "Discard draft",
		style: "secondary",
		role: "other",
	},
	{
		id: "nothing",
		label: "This is nothing",
		style: "secondary",
		role: "dismiss",
	},
	{
		id: "star",
		label: "Star",
		style: "secondary",
		role: "other",
		input: "JSON",
	},
	{
		id: "remove_label",
		label: "Remove label",
		style: "secondary",
		role: "other",
		input: "TEXT",
	},
];

export function threadView(
	messages: GmailMessageView[],
	overrides: Partial<GmailEmailView> = {},
	draftBody = "",
): GmailEmailView {
	const last = messages[messages.length - 1] as GmailMessageView;
	const reply = {
		to: last.from.email === me.email ? last.to : [last.from],
		cc: [],
	};
	return {
		kind: "gmail.email",
		mode: "reply",
		account: { email: me.email, photo: null },
		sendAs,
		canSend: true,
		draftGone: false,
		scheduledAt: null,
		thread: {
			id: "1a0fb9dc85867470",
			subject: "Team offsite in Tahoe",
			labels: [{ id: "INBOX", name: "Inbox", color: null }],
			messages,
			reply,
			replyAll: reply,
		},
		draft: {
			to: reply.to,
			cc: [],
			bcc: [],
			subject: "Re: Team offsite in Tahoe",
			body: draftBody,
			html: null,
			replyAll: false,
			from: me.email,
			attachments: [],
		},
		...overrides,
	};
}

export const composeView: GmailEmailView = {
	kind: "gmail.email",
	mode: "compose",
	account: { email: me.email, photo: null },
	sendAs,
	canSend: true,
	draftGone: false,
	scheduledAt: null,
	thread: null,
	draft: {
		to: [avery],
		cc: [priya],
		bcc: [],
		subject: "Projector for the offsite",
		body: "Hi Avery,\n\nDo you still have the portable projector? We need one for Tahoe next week.\n\nThanks,\nSatya",
		html: null,
		replyAll: false,
		from: me.email,
		attachments: [],
	},
};

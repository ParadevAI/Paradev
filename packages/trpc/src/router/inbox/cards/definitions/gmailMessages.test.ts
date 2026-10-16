import { describe, expect, test } from "bun:test";
import type { gmail_v1 } from "@googleapis/gmail";
import {
	HTML_CLIP_CHARS,
	parseAddressList,
	replyRecipients,
	replySubject,
	threadingHeaders,
	toMessageView,
} from "./gmailMessages";

const b64 = (text: string) => Buffer.from(text).toString("base64url");
const headers = (pairs: Record<string, string>) =>
	Object.entries(pairs).map(([name, value]) => ({ name, value }));
const me = new Set(["satya@superset.sh"]);

function message(
	head: Record<string, string>,
	payload: Partial<gmail_v1.Schema$MessagePart> = {},
	labelIds: string[] = [],
): gmail_v1.Schema$Message {
	return {
		id: "1a0fb9ddcfe52482",
		internalDate: "1790900000000",
		labelIds,
		snippet: "fallback &amp; snippet",
		payload: { headers: headers(head), ...payload },
	};
}

describe("parseAddressList", () => {
	test("keeps commas inside quoted names and brackets", () => {
		expect(
			parseAddressList('"Kim, Avery" <avery@b.co>, Blake <blake@b.co>, c@d.co'),
		).toEqual([
			{ name: "Kim, Avery", email: "avery@b.co" },
			{ name: "Blake", email: "blake@b.co" },
			{ name: null, email: "c@d.co" },
		]);
	});
});

describe("replyRecipients", () => {
	test("a reply to someone else goes to their Reply-To, reply-all adds everyone but me", () => {
		const m = message({
			From: "Avery <avery@b.co>",
			"Reply-To": "Team <team@b.co>",
			To: "Satya <satya@superset.sh>, Blake <blake@b.co>",
			Cc: "Casey <casey@b.co>, satya@superset.sh",
		});
		const { reply, replyAll } = replyRecipients(m, me);
		expect(reply).toEqual({
			to: [{ name: "Team", email: "team@b.co" }],
			cc: [],
		});
		expect(replyAll.to.map((a) => a.email)).toEqual([
			"team@b.co",
			"blake@b.co",
		]);
		expect(replyAll.cc.map((a) => a.email)).toEqual(["casey@b.co"]);
	});

	test("a reply to my own message goes back to the people I sent it to", () => {
		const m = message({
			From: "Satya <satya@superset.sh>",
			To: "Avery <avery@b.co>",
			Cc: "Blake <blake@b.co>",
		});
		const { reply, replyAll } = replyRecipients(m, me);
		expect(reply.to.map((a) => a.email)).toEqual(["avery@b.co"]);
		expect(reply.cc).toEqual([]);
		expect(replyAll.cc.map((a) => a.email)).toEqual(["blake@b.co"]);
	});
});

describe("threading", () => {
	test("In-Reply-To is the answered message and References grows by it", () => {
		const m = message({ "Message-ID": "<b@mail>", References: "<a@mail>" });
		expect(threadingHeaders(m)).toEqual({
			inReplyTo: "<b@mail>",
			references: "<a@mail> <b@mail>",
		});
		expect(threadingHeaders(message({}))).toBeNull();
		expect(
			threadingHeaders(
				message({ "Message-ID": "<b@mail>\r\nBcc: evil@x.co", References: "" }),
			),
		).toEqual({ inReplyTo: "<b@mail>", references: "<b@mail>" });
		const long = Array.from({ length: 40 }, (_, i) => `<r${i}@mail>`).join(" ");
		const kept = threadingHeaders(
			message({ "Message-ID": "<last@mail>", References: long }),
		)?.references.split(" ");
		expect(kept).toHaveLength(20);
		expect(kept?.[0]).toBe("<r0@mail>");
		expect(kept?.at(-1)).toBe("<last@mail>");
		expect(replySubject("Team offsite")).toBe("Re: Team offsite");
		expect(replySubject("RE: Team offsite")).toBe("RE: Team offsite");
	});
});

describe("toMessageView", () => {
	const fileUrl = (messageId: string, partId: string) =>
		`https://api.test/f/${messageId}/${partId}`;

	test("an inline image the HTML never shows is listed with the attachments", () => {
		const m = message(
			{ From: "Avery <avery@b.co>", To: "satya@superset.sh" },
			{
				mimeType: "multipart/related",
				parts: [
					{
						partId: "0",
						mimeType: "text/html",
						body: { data: b64('<img src="cid:Logo%40Seed">') },
					},
					{
						partId: "1",
						mimeType: "image/png",
						filename: "logo.png",
						headers: headers({ "Content-ID": "<logo@seed>" }),
						body: { attachmentId: "a", size: 5 },
					},
					{
						partId: "2",
						mimeType: "image/png",
						filename: "chart.png",
						headers: headers({ "Content-ID": "<chart@seed>" }),
						body: { attachmentId: "b", size: 7 },
					},
				],
			},
		);
		const view = toMessageView(m, { me, fileUrl });
		expect(view.html).toContain("https://api.test/f/1a0fb9ddcfe52482/1");
		expect(view.attachments.map((a) => a.filename)).toEqual(["chart.png"]);
	});

	test("points cid images at signed links and lists real attachments", () => {
		const m = message(
			{ From: "Satya <satya@superset.sh>", To: "satya@superset.sh" },
			{
				mimeType: "multipart/mixed",
				parts: [
					{
						partId: "0",
						mimeType: "text/html",
						body: { data: b64('<div>Lodge:<img src="cid:lodge@seed"></div>') },
					},
					{
						partId: "1",
						mimeType: "image/png",
						filename: "lodge.png",
						headers: headers({
							"Content-ID": "<lodge@seed>",
							"Content-Disposition": "inline",
						}),
						body: { attachmentId: "x", size: 10 },
					},
					{
						partId: "2",
						mimeType: "application/pdf",
						filename: "budget.pdf",
						headers: headers({ "Content-Disposition": "attachment" }),
						body: { attachmentId: "y", size: 2048 },
					},
				],
			},
			["UNREAD", "STARRED"],
		);
		const view = toMessageView(m, {
			me,
			fileUrl,
			imageUrl: (url) => `https://proxy.test/?u=${url}`,
		});
		expect(view.html).toContain('src="https://api.test/f/1a0fb9ddcfe52482/1"');
		expect(view.attachments).toEqual([
			{
				partId: "2",
				filename: "budget.pdf",
				mimeType: "application/pdf",
				size: 2048,
				url: "https://api.test/f/1a0fb9ddcfe52482/2",
				blocked: false,
			},
		]);
		expect(view.unread).toBe(true);
		expect(view.starred).toBe(true);
		expect(view.bcc).toEqual([]);
	});

	test("the folded preview stops at the quoted reply; long HTML is clipped like Gmail clips it", () => {
		const reply = message(
			{ From: "Avery <avery@b.co>" },
			{
				mimeType: "text/plain",
				body: {
					data: b64(
						"Tuesday works.\n\nOn Thu, Oct 2, 2026 at 9:01 AM Satya wrote:\n> Tuesday?",
					),
				},
			},
		);
		expect(toMessageView(reply, { me, fileUrl }).snippet).toBe(
			"Tuesday works.",
		);
		const long = message(
			{ From: "a@b.co" },
			{
				mimeType: "text/html",
				body: { data: b64(`<p>${"x".repeat(HTML_CLIP_CHARS + 10)}</p>`) },
			},
		);
		const view = toMessageView(long, { me, fileUrl });
		expect(view.clipped).toBe(true);
		expect(view.html?.length).toBe(HTML_CLIP_CHARS);
	});
});

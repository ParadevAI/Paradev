import { describe, expect, test } from "bun:test";
import type { GmailMessageView } from "../types";
import { quoteReply, sendInputSchema } from "./gmailReply";

const original: GmailMessageView = {
	id: "m1",
	from: { name: "Avery", email: "avery@b.co" },
	to: [],
	cc: [],
	bcc: [],
	date: "2026-10-02T09:01:00.000Z",
	snippet: "Tuesday?",
	unread: false,
	starred: false,
	html: '<div>Tuesday?<img src="cid:x"></div>',
	clipped: false,
	text: "Tuesday?",
	attachments: [],
};

describe("quoteReply", () => {
	test("quotes the answered message the way Gmail does, escaping the attribution and dropping cid images", () => {
		const { html, text } = quoteReply(
			{
				html: "<p>Yes</p>",
				text: "Yes",
				attribution: "On Oct 2 Avery <avery@b.co> wrote:",
			},
			original,
		);
		expect(html).toContain('<div class="gmail_quote">');
		expect(html).toContain("On Oct 2 Avery &lt;avery@b.co&gt; wrote:");
		expect(html).toContain('<blockquote class="gmail_quote"');
		expect(html).not.toContain("cid:x");
		expect(text).toBe(
			"Yes\n\nOn Oct 2 Avery <avery@b.co> wrote:\n> Tuesday?\n",
		);
	});
});

describe("sendInputSchema", () => {
	test("refuses header injection and non-addresses", () => {
		const base = { to: ["a@b.co"], html: "", text: "" };
		expect(sendInputSchema.safeParse(base).success).toBe(true);
		expect(
			sendInputSchema.safeParse({ ...base, to: ["a@b.co\r\nBcc: x@y.co"] })
				.success,
		).toBe(false);
		expect(
			sendInputSchema.safeParse({ ...base, to: ["not an address"] }).success,
		).toBe(false);
		expect(
			sendInputSchema.safeParse({ ...base, subject: "Hi\r\nBcc: x@y.co" })
				.success,
		).toBe(false);
	});
});

describe("sendInputSchema", () => {
	const base = { to: ["Avery <avery@b.co>"], html: "<p>Hi</p>", text: "Hi" };

	test("takes one real address per entry", () => {
		expect(sendInputSchema.safeParse(base).success).toBe(true);
		for (const bad of [
			"@",
			"x@",
			"a@b.com, evil@x.com",
			"a@b\r\nBcc: c@d.co",
		]) {
			expect(sendInputSchema.safeParse({ ...base, to: [bad] }).success).toBe(
				false,
			);
		}
	});
});

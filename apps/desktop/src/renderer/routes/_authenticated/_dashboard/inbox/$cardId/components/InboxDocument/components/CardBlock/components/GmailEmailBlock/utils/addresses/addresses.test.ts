import { describe, expect, test } from "bun:test";
import {
	formatRecipient,
	parseMailto,
	parseRecipient,
	splitRecipients,
} from "./addresses";

describe("recipients", () => {
	test("parses bare, named and quoted addresses, and refuses the rest", () => {
		expect(parseRecipient("a@b.co")).toEqual({ name: null, email: "a@b.co" });
		expect(parseRecipient("Avery Kim <avery@b.co>")).toEqual({
			name: "Avery Kim",
			email: "avery@b.co",
		});
		expect(parseRecipient('"Kim, Avery" <avery@b.co>')).toEqual({
			name: "Kim, Avery",
			email: "avery@b.co",
		});
		expect(parseRecipient("not an address")).toBeNull();
		expect(parseRecipient("a@b")).toBeNull();
	});

	test("splits a paste on separators outside quotes, and quotes names that need it", () => {
		expect(
			splitRecipients('a@b.co, "Kim, Avery" <avery@b.co>; c@d.co\ne@f.co'),
		).toEqual(["a@b.co", '"Kim, Avery" <avery@b.co>', "c@d.co", "e@f.co"]);
		expect(formatRecipient({ name: "Kim, Avery", email: "avery@b.co" })).toBe(
			'"Kim, Avery" <avery@b.co>',
		);
	});
});

describe("parseMailto", () => {
	test("reads recipients from the path and the query, with subject and body", () => {
		expect(
			parseMailto(
				"mailto:avery@b.co,Blake%20%3Cblake@b.co%3E?cc=casey+trips@b.co&subject=Snacks%20for%20the%20drive&body=Trail%20mix%3F",
			),
		).toEqual({
			to: [
				{ name: null, email: "avery@b.co" },
				{ name: "Blake", email: "blake@b.co" },
			],
			cc: [{ name: null, email: "casey+trips@b.co" }],
			bcc: [],
			subject: "Snacks for the drive",
			body: "Trail mix?",
		});
		expect(parseMailto("https://x.example")).toBeNull();
	});
});

import { expect, test } from "bun:test";
import { inviteTokenFrom } from "./invite-token.ts";

const TOKEN = "upPmVW2O4ukw--suMt71Ww-Lc1frkXWYN_AW42vGmAQ";

test("reads the token from a pasted link or a bare token", () => {
	expect(inviteTokenFrom(` https://api.dev.app/invites/${TOKEN}\n`)).toBe(
		TOKEN,
	);
	expect(inviteTokenFrom(`http://localhost:3001/invites/${TOKEN}/`)).toBe(
		TOKEN,
	);
	expect(inviteTokenFrom(TOKEN)).toBe(TOKEN);
});

test("reads the token from the app's own link, past a query or fragment", () => {
	expect(inviteTokenFrom(`dev://invites/${TOKEN}`)).toBe(TOKEN);
	expect(
		inviteTokenFrom(`https://api.dev.sh/invites/${TOKEN}?utm_source=whatsapp`),
	).toBe(TOKEN);
	expect(inviteTokenFrom(`dev://invites/${TOKEN}#join`)).toBe(TOKEN);
});

test("rejects things that aren't invite links", () => {
	expect(inviteTokenFrom("")).toBeNull();
	expect(inviteTokenFrom("https://example.com/hello")).toBeNull();
	expect(inviteTokenFrom("short")).toBeNull();
	expect(
		inviteTokenFrom(`https://api.dev.sh/invites/${TOKEN.slice(0, 5)}`),
	).toBeNull();
});

import { describe, expect, test } from "bun:test";
import { parseSlackLink } from "./slack-links";

describe("parseSlackLink", () => {
	test("reads a message link, with its thread when it has one", () => {
		expect(
			parseSlackLink(
				"https://acme.slack.com/archives/C0123ABC/p1788794757390949",
			),
		).toEqual({
			kind: "message",
			channel: "C0123ABC",
			ts: "1788794757.390949",
			threadTs: null,
		});
		expect(
			parseSlackLink(
				"https://acme.enterprise.slack.com/archives/C0123ABC/p1788794757390949?thread_ts=1788794700.000100&cid=C0123ABC",
			),
		).toMatchObject({ threadTs: "1788794700.000100" });
	});

	test("reads a profile link", () => {
		expect(parseSlackLink("https://acme.slack.com/team/U0456DEF")).toEqual({
			kind: "user",
			user: "U0456DEF",
		});
	});

	test("ignores everything else", () => {
		for (const href of [
			"https://slack.com/archives/C0123ABC/p1788794757390949",
			"https://www.slack.com/archives/C0123ABC/p1788794757390949",
			"https://api.slack.com/team/U0456DEF",
			"http://acme.slack.com/team/U0456DEF",
			"https://acme.slack.com/archives/C0123ABC",
			"https://acme.slack.com.evil.example/team/U0456DEF",
			"not a url",
		]) {
			expect(parseSlackLink(href)).toBeNull();
		}
	});
});

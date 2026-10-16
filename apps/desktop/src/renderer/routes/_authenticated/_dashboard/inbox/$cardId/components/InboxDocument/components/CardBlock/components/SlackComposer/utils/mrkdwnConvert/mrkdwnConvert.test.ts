import { describe, expect, test } from "bun:test";
import { mrkdwnToMarkdown } from "./mrkdwnConvert";

describe("mrkdwnToMarkdown", () => {
	test("is the inverse for a drafted reply", () => {
		const people = new Map([["U0AB12CD", "Avery Chen"]]);
		expect(
			mrkdwnToMarkdown(
				"*Yes*: ask <@U0AB12CD>, see <https://x.dev|the doc> &amp; _soon_",
				people,
			),
		).toBe(
			"**Yes**: ask [@Avery Chen](superset://users/U0AB12CD), see [the doc](https://x.dev) & *soon*",
		);
	});

	test("opens custom emoji as editor nodes and leaves standard ones as shortcodes", () => {
		expect(
			mrkdwnToMarkdown(
				"ship it :shipit: :tada:",
				new Map(),
				new Set(["shipit"]),
			),
		).toBe('ship it <span data-type="emoji" data-name="shipit"></span> :tada:');
	});

	test("channel mentions open as links named from the directory and post as <#C…>", () => {
		const markdown = mrkdwnToMarkdown(
			"see <#C0BUGS1> and <#C0GEN22|general>",
			new Map(),
			new Set(),
			{
				C0BUGS1: "bugs",
			},
		);
		expect(markdown).toBe(
			"see [#bugs](superset://slack-channels/C0BUGS1) and [#general](superset://slack-channels/C0GEN22)",
		);
	});

	test("broadcasts and user groups open as the words the reader types for them", () => {
		expect(
			mrkdwnToMarkdown(
				"<!channel> and <!here|here>: <!subteam^S0ENG> <!subteam^S0OPS|@ops>",
				new Map(),
				new Set(),
				{},
				{ S0ENG: "eng" },
			),
		).toBe("@channel and @here: @eng @ops");
	});
});

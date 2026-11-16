import { describe, expect, test } from "bun:test";
import { type ChatContext, turnInput } from "./turn-input.ts";

const TEXT =
	'## New message\nChat: the group "Goa trip"\nFrom: bob\nTime: 2026-10-13 14:02 UTC\n\nWhere do we stay?';
const ROSTER = "alice · person · u1\nbob · person · u2";
const chat = (recent: [string, boolean][], roster = ROSTER): ChatContext => ({
	recent: recent.map(([line, seen]) => ({ line, seen })),
	roster,
});
const THIS_RULE =
	'A short message like "this", "that" or "it" is about the newest message here, the one marked (latest), unless it names something else.';
const ROSTER_BLOCK = `In this chat (names can repeat; use ids with \`dev ask\`, and \`<@dev:id>\` / \`<@user:id>\` to mention exactly):\n${ROSTER}`;

describe("a turn's input", () => {
	test("a fresh session: what happened, then a note that history is missing with the chat's recent messages, then who's here", () => {
		const input = turnInput(
			TEXT,
			chat([
				["- alice: villa?", true],
				["- you: maybe", true],
				["- bob: or a hotel", false],
			]),
			{ fresh: true },
		);
		expect(input).toBe(
			[
				TEXT,
				"New session: your earlier conversation in this chat isn't in your context. `dev chat read --limit 50` reads older messages.\n\nRecent messages here (oldest first):\n- alice: villa?\n- you: maybe\n- bob: or a hotel",
				ROSTER_BLOCK,
			].join("\n\n"),
		);
	});

	test("a chat's very first message has no history to miss: no note, just who's here", () => {
		expect(turnInput(TEXT, chat([]), { fresh: true })).toBe(
			`${TEXT}\n\n${ROSTER_BLOCK}`,
		);
	});

	test("after a rollover, the fresh session opens with the old one's handover note", () => {
		const input = turnInput(TEXT, chat([["- alice: villa?", true]]), {
			fresh: true,
			handover: "Alice wants a villa; budget 200 a night.\n",
		});
		expect(input).toContain(
			"New session: your last one in this chat filled up and was closed. Its handover note:\nAlice wants a villa; budget 200 a night.\n`dev chat read --limit 50` reads older messages.\n\nRecent messages here (oldest first):\n- alice: villa?",
		);
	});

	test("a running session gets only the messages it hasn't seen, and the roster only when it changed", () => {
		const recent = chat([
			["- alice: villa?", true],
			["- bob: or a hotel", false],
		]);
		expect(turnInput(TEXT, recent, { fresh: false, roster: ROSTER })).toBe(
			`${TEXT}\n\nSince your last turn here, not in your history above (oldest first):\n- bob: or a hotel (latest)\n\n${THIS_RULE}`,
		);
		expect(
			turnInput(TEXT, chat([["- alice: villa?", true]]), {
				fresh: false,
				roster: ROSTER,
			}),
		).toBe(TEXT);
		const changed = chat([], `${ROSTER}\ncarol · person · u3`);
		expect(
			turnInput(TEXT, changed, { fresh: false, roster: ROSTER }),
		).toEndWith("bob · person · u2\ncarol · person · u3");
		// After a box restart the runner doesn't know what roster the session had: it's given again.
		expect(turnInput(TEXT, chat([]), { fresh: false })).toBe(
			`${TEXT}\n\n${ROSTER_BLOCK}`,
		);
	});

	test('what another session posted since the last turn comes with the newest line marked, so "this" means it', () => {
		const input = turnInput(
			"## New message\nFrom: harshith\n\nyou can leave this satya will look into it",
			chat([
				["- you: Wesley still has no Environments page", false],
				[
					"- you: Account email change (needs Satya): Jani wants his address changed",
					false,
				],
			]),
			{ fresh: false, roster: ROSTER },
		);
		expect(input).toContain(
			"- you: Wesley still has no Environments page\n- you: Account email change (needs Satya): Jani wants his address changed (latest)\n\n",
		);
		expect(input.match(/\(latest\)/g)).toHaveLength(2); // the one mark and the rule that names it
		expect(input).toEndWith(THIS_RULE);
	});

	test("recent messages are kept to about 3k tokens, the newest ones", () => {
		const long = Array.from(
			{ length: 30 },
			(_, i) =>
				[
					`- alice: ${String(i).padStart(2, "0")} ${"x".repeat(590)}`,
					false,
				] as [string, boolean],
		);
		const input = turnInput(TEXT, chat(long), { fresh: true });
		expect(input).toContain("- alice: 29 ");
		expect(input).not.toContain("- alice: 10 ");
		expect(input.length).toBeLessThan(TEXT.length + 13_000);
	});

	test("the brief goes in a fresh session, and again only when it changed, with how to keep it", () => {
		const brief =
			"Your brief of this chat, as people here see it at a glance:\n- (none yet)\nWaiting on people here: Ann 2 tasks due today or late.";
		const withBrief = { ...chat([]), brief };
		expect(turnInput(TEXT, withBrief, { fresh: true })).toContain(
			`${brief}\nIf this turn changes what's happening here`,
		);
		expect(
			turnInput(TEXT, withBrief, { fresh: false, roster: ROSTER, brief }),
		).toBe(TEXT);
		expect(
			turnInput(
				TEXT,
				{ ...withBrief, brief: `${brief} ` },
				{ fresh: false, roster: ROSTER, brief },
			),
		).toContain("dev brief");
	});

	test("an older API sends no chat context: the text goes as it is", () => {
		expect(turnInput(TEXT, undefined, { fresh: true })).toBe(TEXT);
	});
});

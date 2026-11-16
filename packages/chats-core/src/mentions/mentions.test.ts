import { describe, expect, test } from "bun:test";
import {
	mentionToken,
	parseMentionTokens,
	renderMentions,
	splitMentions,
} from "./mentions.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("mention tokens", () => {
	test("round-trip a token and find every mention once, in order", () => {
		expect(mentionToken({ kind: "dev", id: A })).toBe(`<@dev:${A}>`);
		expect(
			parseMentionTokens(
				`hi <@dev:${A}> and <@user:${B}>, <@dev:${A.toUpperCase()}>`,
			),
		).toEqual([
			{ kind: "dev", id: A },
			{ kind: "user", id: B },
		]);
	});

	test("ignore look-alikes that aren't tokens", () => {
		expect(
			parseMentionTokens(`<@dev:not-a-uuid> <@robot:${A}> @Juniper`),
		).toEqual([]);
	});

	test("split into text and mentions", () => {
		expect(splitMentions(`<@dev:${A}> ask <@user:${B}>!`)).toEqual([
			{ type: "mention", kind: "dev", id: A },
			{ type: "text", text: " ask " },
			{ type: "mention", kind: "user", id: B },
			{ type: "text", text: "!" },
		]);
		expect(splitMentions("plain")).toEqual([{ type: "text", text: "plain" }]);
	});

	test("render tokens as readable @names", () => {
		const names: Record<string, string> = {
			[A]: "Juniper (alice's)",
			[B]: "bob",
		};
		expect(
			renderMentions(
				`<@dev:${A}> ask <@user:${B}> when`,
				(r) => names[r.id] ?? "unknown",
			),
		).toBe("@Juniper (alice's) ask @bob when");
	});
});

describe("emoji around mentions", () => {
	// Surrogate pairs, ZWJ sequences, flags and skin tones come through whole on either side of a token.
	const EMOJI = ["👋", "👨‍👩‍👧", "🇮🇳", "👍🏽"];

	test("text segments keep every emoji intact, right before and after a token", () => {
		for (const emoji of EMOJI) {
			const segments = splitMentions(`${emoji}<@dev:${A}>${emoji} ok ${emoji}`);
			expect(segments).toEqual([
				{ type: "text", text: emoji },
				{ type: "mention", kind: "dev", id: A },
				{ type: "text", text: `${emoji} ok ${emoji}` },
			]);
		}
	});

	test("rendering names keeps emoji whole", () => {
		expect(renderMentions(`👨‍👩‍👧 <@user:${B}> 🇮🇳👍🏽`, () => "Priya")).toBe(
			"👨‍👩‍👧 @Priya 🇮🇳👍🏽",
		);
	});
});

import { describe, expect, test } from "bun:test";
import { withQuotedReplies } from "@superset/chat/core";
import {
	elementsAfter,
	elementsForChips,
	splitByElements,
} from "./messageElements";

describe("messageElements", () => {
	test("round-trips chips through byte ranges, past non-ASCII text", () => {
		const text = "café: look at src/a.ts and src/a.ts again";
		const chip = {
			label: "a.ts",
			serialized: "src/a.ts",
			data: { elementKind: "file_mention" },
		};
		const elements = elementsForChips(text, [chip, chip]);
		expect(elements.map((element) => element.byteRange)).toEqual([
			{ start: 15, end: 23 },
			{ start: 28, end: 36 },
		]);
		expect(
			splitByElements(text, elements).map((segment) =>
				segment.element ? `[${segment.element.label}]` : segment.text,
			),
		).toEqual(["café: look at ", "[a.ts]", " and ", "[a.ts]", " again"]);
	});

	test("sends a link chip as its plain URL, with no element", () => {
		const url = "https://github.com/acme/widgets/pull/42";
		const elements = elementsForChips(`See ${url} and @auth.ts`, [
			{ label: "acme/widgets#42", serialized: url, data: { link: url } },
			{
				label: "auth.ts",
				serialized: "@auth.ts",
				data: { elementKind: "file_mention" },
			},
		]);
		expect(elements.map((element) => element.label)).toEqual(["auth.ts"]);
	});

	test("keeps what the composer knew about a linked pull request", () => {
		const url = "https://github.com/acme/widgets/pull/42";
		const data = {
			kind: "linked_pr",
			pr: { prNumber: 42, title: "Fix it", url, state: "merged" },
		};
		const [element] = elementsForChips(`See ${url}`, [
			{ label: "#42", serialized: url, data },
		]);
		expect(element?.label).toBe("#42");
		expect(element?.data).toEqual(data);
	});

	test("measures chips past the quotes sent ahead of them, and back", () => {
		const message = "fix src/é.ts";
		const sent = withQuotedReplies(["the café bug"], message);
		const before = sent.slice(0, sent.length - message.length);
		const chip = {
			label: "é.ts",
			serialized: "src/é.ts",
			data: { elementKind: "file_mention" },
		};
		const [element] = elementsForChips(message, [chip], before);
		const bytes = new TextEncoder().encode(sent);
		const range = element?.byteRange ?? { start: 0, end: 0 };
		expect(new TextDecoder().decode(bytes.slice(range.start, range.end))).toBe(
			"src/é.ts",
		);
		expect(
			splitByElements(
				message,
				elementsAfter(element ? [element] : [], before),
			).map((segment) => segment.element?.label ?? segment.text),
		).toEqual(["fix ", "é.ts"]);
	});
});

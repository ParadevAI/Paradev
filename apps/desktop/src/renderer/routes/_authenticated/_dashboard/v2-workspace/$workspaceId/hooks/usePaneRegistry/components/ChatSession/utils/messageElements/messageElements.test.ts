import { describe, expect, test } from "bun:test";
import {
	elementsForChips,
	memberChip,
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

	test("keeps a mention of an agent drawn as a mention", () => {
		const text = "@Ticket can you check this";
		const [element] = elementsForChips(text, [
			{
				label: "@Ticket",
				serialized: "@Ticket",
				variant: "member",
				data: { workspaceId: "ws-1" },
			},
		]);
		expect(element?.elementKind).toBe("other");
		const segment = splitByElements(text, element ? [element] : [])[0];
		expect(
			segment?.element ? memberChip(segment.text, segment.element) : null,
		).toEqual({
			label: "@Ticket",
			serialized: "@Ticket",
			variant: "member",
			data: { workspaceId: "ws-1", variant: "member" },
		});
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
});

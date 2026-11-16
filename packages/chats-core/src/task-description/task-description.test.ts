import { describe, expect, test } from "bun:test";
import { descriptionBlocks, descriptionMarkdown } from "./task-description.ts";

const ROMA =
	"Get a costume sorted early.\n\n- [x] Check what's trending\n- [ ] Pick a direction\n- [ ] Try it on";

describe("descriptionBlocks", () => {
	test("splits checklist items from the text around them", () => {
		expect(descriptionBlocks(ROMA)).toEqual([
			{ kind: "text", text: "Get a costume sorted early.\n" },
			{
				kind: "check",
				indent: "",
				marker: "-",
				checked: true,
				text: "Check what's trending",
			},
			{
				kind: "check",
				indent: "",
				marker: "-",
				checked: false,
				text: "Pick a direction",
			},
			{
				kind: "check",
				indent: "",
				marker: "-",
				checked: false,
				text: "Try it on",
			},
		]);
	});

	test("an empty description has no blocks", () => {
		expect(descriptionBlocks("")).toEqual([]);
	});

	test("reads nested items, other markers, a capital X and an item with no text", () => {
		expect(descriptionBlocks("* [X] done\n  + [ ]")).toEqual([
			{ kind: "check", indent: "", marker: "*", checked: true, text: "done" },
			{ kind: "check", indent: "  ", marker: "+", checked: false, text: "" },
		]);
	});

	test("checklist-looking lines inside a code fence stay text", () => {
		const md = "```md\n- [ ] not a task\n~~~\n```\n- [ ] a task";
		expect(descriptionBlocks(md).map((b) => b.kind)).toEqual(["text", "check"]);
	});

	test("plain bullets and links in brackets are text", () => {
		expect(
			descriptionBlocks("- milk\n- [link](https://a.b)\n-[ ] no space").map(
				(b) => b.kind,
			),
		).toEqual(["text"]);
	});
});

describe("descriptionMarkdown", () => {
	test("round-trips a description", () => {
		for (const md of [
			ROMA,
			"",
			"one\n\ntwo",
			"- [ ] a\n\n- [x] b\n\ntext after",
			"```\n- [ ] x\n```",
			"  - [ ] nested\n- [ ]",
		]) {
			expect(descriptionMarkdown(descriptionBlocks(md))).toBe(md);
		}
	});

	test("a ticked item is written with a lower-case x", () => {
		expect(
			descriptionMarkdown([
				{
					kind: "check",
					indent: "",
					marker: "-",
					checked: true,
					text: "Pick a direction",
				},
			]),
		).toBe("- [x] Pick a direction");
		expect(descriptionMarkdown(descriptionBlocks("- [X] a"))).toBe("- [x] a");
	});
});

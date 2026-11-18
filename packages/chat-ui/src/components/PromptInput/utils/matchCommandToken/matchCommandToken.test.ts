import { describe, expect, test } from "bun:test";
import { matchCommandToken } from "./matchCommandToken";

describe("matchCommandToken", () => {
	test("a command that is the whole message is leading", () => {
		expect(matchCommandToken("/fork here")).toMatchObject({
			leadOffset: 0,
			matchingString: "fork here",
			leading: true,
		});
	});

	test("a command after a space mid-sentence is inline", () => {
		expect(
			matchCommandToken("then tell me if we are stacked and do /cod"),
		).toMatchObject({
			leadOffset: 38,
			matchingString: "cod",
			replaceableString: "/cod",
			leading: false,
		});
		expect(matchCommandToken("run /")?.matchingString).toBe("");
	});

	test("an inline command ends at a space", () => {
		expect(matchCommandToken("run /code-review now")).toBeNull();
	});

	test("paths and URLs do not open the menu", () => {
		expect(matchCommandToken("see src/app")).toBeNull();
		expect(matchCommandToken("open https://x.dev/a")).toBeNull();
		expect(matchCommandToken("look in /usr/bin")).toBeNull();
	});

	test("a later line or a word break offers only inline commands", () => {
		expect(matchCommandToken("/", "word")).toMatchObject({
			leadOffset: 0,
			matchingString: "",
			leading: false,
		});
		expect(matchCommandToken("/fork here", "word")).toBeNull();
		expect(matchCommandToken("/usr/bin", "word")).toBeNull();
	});

	test("a token glued to the word or chip before it does not open the menu", () => {
		expect(matchCommandToken("/cod", "none")).toBeNull();
		expect(matchCommandToken(" /cod", "none")?.matchingString).toBe("cod");
	});
});

describe("matchCommandToken with the $ skill sigil", () => {
	test("$ opens skills at the start and mid-sentence", () => {
		expect(matchCommandToken("$fi")).toMatchObject({
			leadOffset: 0,
			matchingString: "fi",
			replaceableString: "$fi",
			sigil: "$",
			leading: false,
		});
		expect(matchCommandToken("then run $")).toMatchObject({
			leadOffset: 9,
			matchingString: "",
			sigil: "$",
		});
	});

	test("shell forms and prices do not open the menu", () => {
		for (const text of ["echo $HOME", "cost $5", "run $(pwd", "a$b", "$_x"]) {
			expect(matchCommandToken(text)).toBeNull();
		}
		expect(matchCommandToken("$cod", "none")).toBeNull();
	});
});

describe("matchCommandToken with text after the caret", () => {
	test("a caret inside a word does not open the menu", () => {
		expect(matchCommandToken("Use /et", "message", "c/hosts now")).toBeNull();
		expect(matchCommandToken("run $fi", "message", "nd")).toBeNull();
	});

	test("a caret before a space or the end still opens it", () => {
		expect(
			matchCommandToken("Use /co", "message", " later")?.matchingString,
		).toBe("co");
		expect(matchCommandToken("/fo", "message", "rk")?.leading).toBe(true);
	});
});

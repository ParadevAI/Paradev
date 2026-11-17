import { describe, expect, test } from "bun:test";
import { plainText } from "./plain-text.ts";

describe("plainText", () => {
	test("drops markdown syntax and keeps the words", () => {
		expect(
			plainText(
				"# Plan\n\n- **Fly** on _Friday_\n- see [the doc](https://x.dev) and `npm i`",
			),
		).toBe("Plan Fly on Friday see the doc and npm i");
	});

	test("keeps code inside fences and snake_case words", () => {
		expect(plainText("```ts\nconst a = 1\n```\nuse my_var")).toBe(
			"const a = 1 use my_var",
		);
	});
});

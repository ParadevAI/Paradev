import { describe, expect, test } from "bun:test";
import { plainText } from "./plainText";

describe("plainText", () => {
	test("drops the marks and keeps the words", () => {
		expect(
			plainText(
				"## Report\n\n**Where they render:** `TitleBar.tsx` has *two* slots.\n\n- see [the PR](https://x.y/pull/1)\n> quoted\n\n```ts\nconst a = 1;\n```",
			),
		).toBe(
			"Report\n\nWhere they render: TitleBar.tsx has two slots.\n\nsee the PR\nquoted\n\nconst a = 1;",
		);
	});

	test("leaves plain prose alone", () => {
		expect(plainText("Done: 2 files, 3 * 4 = 12.")).toBe(
			"Done: 2 files, 3 * 4 = 12.",
		);
	});
});

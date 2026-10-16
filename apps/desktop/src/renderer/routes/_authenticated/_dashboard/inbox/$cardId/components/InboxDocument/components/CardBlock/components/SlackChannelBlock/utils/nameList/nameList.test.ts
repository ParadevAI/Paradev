import { describe, expect, test } from "bun:test";
import { nameList } from "./nameList";

const more = (count: number) => `${count} more`;

describe("nameList", () => {
	test("names up to three people", () => {
		expect(nameList(["Avery"], more)).toBe("Avery");
		expect(nameList(["Avery", "Blake"], more)).toBe("Avery and Blake");
		expect(nameList(["Avery", "Blake", "Casey"], more)).toBe(
			"Avery, Blake, and Casey",
		);
	});

	test("counts the rest", () => {
		expect(nameList(["Avery", "Blake", "Casey", "Devon", "Eli"], more)).toBe(
			"Avery, Blake, Casey, and 2 more",
		);
	});
});

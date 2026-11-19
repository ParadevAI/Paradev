import { expect, test } from "bun:test";
import { initials } from "./initials";

test("takes the first and last word, and one letter for one word", () => {
	expect(initials("Maya van Dijk")).toBe("MD");
	expect(initials("  ines  ")).toBe("I");
	expect(initials("")).toBe("");
});

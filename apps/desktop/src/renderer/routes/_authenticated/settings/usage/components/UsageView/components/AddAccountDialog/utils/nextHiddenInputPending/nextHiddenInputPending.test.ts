import { expect, it } from "bun:test";
import { nextHiddenInputPending } from "./nextHiddenInputPending";

it("is pending after a paste and clears on Enter or Ctrl+C", () => {
	expect(nextHiddenInputPending(false, "abc#state")).toBe(true);
	expect(nextHiddenInputPending(false, "\u001b[200~abc#state\u001b[201~")).toBe(
		true,
	);
	expect(nextHiddenInputPending(true, "\r")).toBe(false);
	expect(nextHiddenInputPending(true, "\u0003")).toBe(false);
	expect(nextHiddenInputPending(false, "abc\r")).toBe(false);
});

it("ignores terminal query replies and escape keys", () => {
	expect(
		nextHiddenInputPending(false, "\u001b]11;rgb:0000/0000/0000\u001b\\"),
	).toBe(false);
	expect(nextHiddenInputPending(false, "\u001b[1;1R")).toBe(false);
	expect(nextHiddenInputPending(true, "\u001b[D")).toBe(true);
});

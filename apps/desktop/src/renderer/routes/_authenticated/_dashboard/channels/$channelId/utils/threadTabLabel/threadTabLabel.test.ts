import { expect, test } from "bun:test";
import { threadTabLabel } from "./threadTabLabel";

test("names a thread after its first message", () => {
	expect(threadTabLabel("  Ship\\nit  ".replace("\\n", "\n"), "Thread")).toBe(
		"Ship it",
	);
	expect(threadTabLabel("", "Thread")).toBe("Thread");
	expect(threadTabLabel("x".repeat(80), "Thread")).toHaveLength(48);
});

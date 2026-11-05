import { expect, test } from "bun:test";
import { freshStartMode, withSavedMode } from "./savedChatMode";

test("keeps one mode per agent, newest last, and at most 32 agents", () => {
	expect(withSavedMode({ claude: "default" }, "claude", "auto")).toEqual({
		claude: "auto",
	});
	const full = Object.fromEntries(
		Array.from({ length: 32 }, (_, index) => [`agent${index}`, "default"]),
	);
	const next = withSavedMode(full, "codex", "read-only");
	expect(Object.keys(next)).toHaveLength(32);
	expect(next.agent0).toBeUndefined();
	expect(next.codex).toBe("read-only");
});

test("never saves plan as the mode new chats start in", () => {
	expect(withSavedMode({ claude: "auto" }, "claude", "plan")).toEqual({
		claude: "auto",
	});
});

test("a new chat starts in the pane's mode, but never in plan", () => {
	expect(freshStartMode("default", "bypassPermissions")).toBe("default");
	expect(freshStartMode("plan", "bypassPermissions")).toBe("bypassPermissions");
	expect(freshStartMode(undefined, "auto")).toBe("auto");
});

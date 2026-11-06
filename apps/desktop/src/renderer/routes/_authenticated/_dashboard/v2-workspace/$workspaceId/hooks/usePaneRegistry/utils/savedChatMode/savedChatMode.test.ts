import { expect, test } from "bun:test";
import { freshStartMode, withoutSavedMode } from "./savedChatMode";

test("forgets one agent's mode, and the whole key with the last one", () => {
	expect(
		withoutSavedMode({ claude: "default", codex: "read-only" }, "claude"),
	).toEqual({ codex: "read-only" });
	expect(withoutSavedMode({ claude: "default" }, "claude")).toBeNull();
});

test("a new chat starts in the pane's mode, but never in plan", () => {
	expect(freshStartMode("default", "bypassPermissions")).toBe("default");
	expect(freshStartMode("plan", "bypassPermissions")).toBe("bypassPermissions");
	expect(freshStartMode(undefined, "auto")).toBe("auto");
});

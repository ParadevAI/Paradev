import { expect, test } from "bun:test";
import { sessionInfoFromState } from "./sessionInfoFromState";

test("reports the session's mode so the pane can resume in it", () => {
	expect(
		sessionInfoFromState(
			{ status: "idle", harness: "claude-acp", modeId: "bypassPermissions" },
			undefined,
		),
	).toEqual({ modeId: "bypassPermissions" });
});

test("reports a harness session only when it differs from the bound one", () => {
	const state = {
		status: "idle" as const,
		harness: "claude-acp",
		harnessSessionId: "native",
	};
	expect(sessionInfoFromState(state, "native")).toEqual({});
	expect(sessionInfoFromState(state, "other")).toEqual({
		harnessSessionId: "native",
	});
});

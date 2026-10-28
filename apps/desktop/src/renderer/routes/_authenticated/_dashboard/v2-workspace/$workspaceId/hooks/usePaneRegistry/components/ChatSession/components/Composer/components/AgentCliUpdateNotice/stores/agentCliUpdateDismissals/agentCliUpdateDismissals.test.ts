import { describe, expect, it } from "bun:test";
import {
	dismissAgentCliUpdate,
	isAgentCliUpdateDismissed,
	useAgentCliUpdateDismissals,
} from "./agentCliUpdateDismissals";

describe("dismissAgentCliUpdate", () => {
	it("keeps one dismissed release per CLI, so a newer one shows again", () => {
		dismissAgentCliUpdate("codex", "0.165.0");
		dismissAgentCliUpdate("claude", "2.1.312");
		dismissAgentCliUpdate("codex", "0.166.0");

		const { dismissedAt } = useAgentCliUpdateDismissals.getState();
		expect(Object.keys(dismissedAt).sort()).toEqual([
			"claude@2.1.312",
			"codex@0.166.0",
		]);
		expect(isAgentCliUpdateDismissed(dismissedAt, "codex", "0.165.0")).toBe(
			false,
		);
	});
});

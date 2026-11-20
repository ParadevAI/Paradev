import { expect, test } from "bun:test";
import { sessionModelCatalog } from "./session";

test("active session options are scoped to their workspace and an empty list is authoritative", () => {
	const session = {
		scopeId: "workspace-a",
		harness: "codex-acp",
		state: {
			harness: "codex-acp",
			status: "idle" as const,
			configOptions: [
				{ id: "model", label: "Model", category: "model", options: [] },
			],
		},
	};
	expect(sessionModelCatalog(session, "workspace-a")).toMatchObject({
		models: [],
		source: "runtime",
		availability: "reported",
	});
	expect(sessionModelCatalog(session, "workspace-b")).toBeUndefined();
	expect(
		sessionModelCatalog(
			{ ...session, state: { ...session.state, status: "dead" } },
			"workspace-a",
		),
	).toBeUndefined();
	expect(
		sessionModelCatalog(
			{ ...session, state: { harness: "codex-acp", status: "idle" } },
			"workspace-a",
		)?.availability,
	).toBe("unknown");
});

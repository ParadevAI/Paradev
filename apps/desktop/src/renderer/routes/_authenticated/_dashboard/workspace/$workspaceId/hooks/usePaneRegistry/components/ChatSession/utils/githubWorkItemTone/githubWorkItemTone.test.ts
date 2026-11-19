import { expect, test } from "bun:test";
import { githubWorkItemTone } from "./githubWorkItemTone";

const item = (
	state: "open" | "closed" | "merged",
	options: { draft?: boolean; stateReason?: string | null } = {},
) => ({
	state,
	draft: options.draft ?? false,
	stateReason: options.stateReason ?? null,
});

test("a pull request takes GitHub's colour for its state", () => {
	expect(githubWorkItemTone("pr", null)).toBe("neutral");
	expect(githubWorkItemTone("pr", item("open"))).toBe("open");
	expect(githubWorkItemTone("pr", item("open", { draft: true }))).toBe(
		"neutral",
	);
	expect(githubWorkItemTone("pr", item("merged"))).toBe("done");
	expect(githubWorkItemTone("pr", item("closed"))).toBe("closed");
	expect(githubWorkItemTone("pr", item("closed", { draft: true }))).toBe(
		"closed",
	);
});

test("a closed issue reads as done unless it closed as not planned or a duplicate", () => {
	expect(githubWorkItemTone("issue", item("open"))).toBe("open");
	expect(
		githubWorkItemTone("issue", item("closed", { stateReason: "completed" })),
	).toBe("done");
	expect(githubWorkItemTone("issue", item("closed"))).toBe("done");
	expect(
		githubWorkItemTone("issue", item("closed", { stateReason: "not_planned" })),
	).toBe("neutral");
	expect(
		githubWorkItemTone("issue", item("closed", { stateReason: "duplicate" })),
	).toBe("neutral");
});

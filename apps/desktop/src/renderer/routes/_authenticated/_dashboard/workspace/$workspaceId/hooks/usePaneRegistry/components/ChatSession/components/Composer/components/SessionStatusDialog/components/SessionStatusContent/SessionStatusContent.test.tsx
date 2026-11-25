import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const { SessionStatusContent } = await import("./SessionStatusContent");

afterEach(cleanup);

const now = new Date("2026-10-26T12:00:00Z");
const limits = {
	now,
	status: null,
	windows: [
		{
			id: "five_hour",
			label: "Session (5h)",
			usedPercent: 82,
			resetsAt: new Date("2026-10-26T14:00:00Z"),
		},
	],
};

describe("SessionStatusContent", () => {
	test("shows the context window the agent reported and the account's limits", () => {
		const { container } = render(
			<SessionStatusContent
				agent="Claude"
				model="Opus"
				fast={false}
				workspace="worktree"
				branch="chat-context-ring"
				usage={{ contextUsed: 84_000, contextSize: 200_000, costUsd: 1.5 }}
				limits={limits}
			/>,
		);

		const text = container.textContent ?? "";
		expect(text).toContain("Opus");
		expect(text).toContain("FastOff");
		expect(text).toContain("WorkspaceWorktree");
		expect(text).toContain("Used84K · 42%");
		expect(text).toContain("Remaining116K");
		expect(text).toContain("Window200K");
		expect(text).toContain("Session cost$1.50");
		expect(text).toContain("Session (5h)82% used · Resets in 2h");
		expect(text).not.toContain("Effort");
	});

	test("warns that the account's limits are out of date next to the cached windows", () => {
		const { container } = render(
			<SessionStatusContent
				usage={null}
				limits={{ ...limits, status: "Usage is out of date" }}
			/>,
		);

		expect(container.textContent).toContain(
			"Rate limitsUsage is out of dateSession (5h)82% used",
		);
	});

	test("says the context window is not reported before the agent sends usage", () => {
		const { container } = render(
			<SessionStatusContent
				agent="Claude"
				usage={null}
				limits={{ now, status: "API billing", windows: [] }}
			/>,
		);

		const text = container.textContent ?? "";
		expect(text).toContain("Context windowNot reported yet");
		expect(text).toContain("Rate limitsAPI billing");
		expect(text).not.toContain("Remaining");
	});
});

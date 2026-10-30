import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { QueuePausedBar } from "./QueuePausedBar";

afterEach(cleanup);

test("a queue the usage limit paused says so and leaves resuming to the limit notice", () => {
	const view = render(
		<QueuePausedBar
			actionable
			byLimit
			onClear={() => undefined}
			onResume={() => undefined}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Queue paused by the usage limit",
	);
	expect(view.queryByText("Resume")).toBeNull();
});

test("a queue the user paused offers its own resume", () => {
	const view = render(
		<QueuePausedBar
			actionable
			byLimit={false}
			onClear={() => undefined}
			onResume={() => undefined}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Queue paused because you interrupted",
	);
	expect(view.getByText("Resume")).toBeTruthy();
});

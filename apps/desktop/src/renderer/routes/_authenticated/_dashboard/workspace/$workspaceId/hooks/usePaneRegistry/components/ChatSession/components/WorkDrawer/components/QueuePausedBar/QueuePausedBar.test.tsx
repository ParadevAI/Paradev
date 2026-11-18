import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { QueuePausedBar } from "./QueuePausedBar";

afterEach(cleanup);

test("a queue the usage limit paused says so, even after its notice is dismissed", () => {
	const view = render(
		<QueuePausedBar
			actionable
			reason="limit"
			onClear={() => undefined}
			onResume={() => undefined}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Queue paused by the usage limit",
	);
	expect(view.getByText("Resume")).toBeTruthy();
});

test("a queue the user paused offers its own resume", () => {
	const view = render(
		<QueuePausedBar
			actionable
			reason="interrupt"
			onClear={() => undefined}
			onResume={() => undefined}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Queue paused because you interrupted",
	);
	expect(view.getByText("Resume")).toBeTruthy();
});

test("a queue Paradev's shutdown left waiting says so", () => {
	const view = render(
		<QueuePausedBar
			actionable
			reason="shutdown"
			onClear={() => undefined}
			onResume={() => undefined}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Queue paused when Paradev closed",
	);
});

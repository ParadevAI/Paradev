import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { RunStatus } from "./RunStatus";

afterEach(cleanup);

const textOf = (element: Parameters<typeof render>[0]) =>
	render(element).container.textContent;

test("a settled run says how it ended and how long it took", () => {
	expect(
		textOf(
			<RunStatus endedAtMs={21_000} startedAtMs={1_000} status="finished" />,
		),
	).toBe("finished·20s");
	expect(
		textOf(
			<RunStatus endedAtMs={21_000} startedAtMs={1_000} status="failed" />,
		),
	).toBe("failed·20s");
});

test("a failed command says its exit code instead of its time", () => {
	expect(
		textOf(
			<RunStatus
				endedAtMs={21_000}
				exitCode={1}
				startedAtMs={1_000}
				status="failed"
			/>,
		),
	).toBe("failed · exit 1");
});

test("a stopped run says only that it stopped", () => {
	expect(
		textOf(
			<RunStatus endedAtMs={21_000} startedAtMs={1_000} status="stopped" />,
		),
	).toBe("stopped");
});

test("a running run counts its time, and a parent says how many subagents it waits on", () => {
	const startedAtMs = Date.now() - 12_000;
	expect(
		textOf(
			<RunStatus endedAtMs={null} startedAtMs={startedAtMs} status="running" />,
		),
	).toBe("running·12s");
	expect(
		textOf(
			<RunStatus
				endedAtMs={null}
				startedAtMs={startedAtMs}
				status="waiting"
				waitingOn={2}
			/>,
		),
	).toBe("waiting on 2 subagents·12s");
});

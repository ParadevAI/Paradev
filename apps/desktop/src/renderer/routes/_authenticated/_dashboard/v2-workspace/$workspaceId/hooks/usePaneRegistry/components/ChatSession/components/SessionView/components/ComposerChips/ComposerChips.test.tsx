import { afterEach, expect, test } from "bun:test";
import type { BackgroundTask } from "@superset/chat/protocol";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { ComposerChips } from "./ComposerChips";

afterEach(cleanup);

const shell = (id: string): BackgroundTask => ({
	id,
	kind: "process",
	name: `npm run ${id}`,
	canStop: true,
	startedAtMs: Date.now(),
});

const subagent = (id: string): BackgroundTask => ({
	id,
	kind: "subagent",
	name: id,
	canStop: true,
	startedAtMs: Date.now(),
});

const chips = (
	backgroundTasks: BackgroundTask[],
	onStopTask: (taskId: string) => Promise<void> = async () => {},
	onStopAll?: () => void,
) => (
	<ComposerChips
		backgroundTasks={backgroundTasks}
		liveRefreshKey={0}
		onMoveToBackground={() => {}}
		onOpenSubagent={() => {}}
		onStopAll={onStopAll}
		onStopTask={onStopTask}
		runningTurnId={null}
		sessionId="session"
		terminalId="terminal"
	/>
);

const openList = () =>
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: /Background/ }));
	});

test("a list left open when its last task ended stays closed for the next task", () => {
	const view = render(chips([shell("dev")]));
	openList();
	expect(screen.queryByText("npm run dev")).not.toBeNull();

	view.rerender(chips([]));
	view.rerender(chips([shell("build")]));

	expect(screen.queryByRole("button", { name: /Background/ })).not.toBeNull();
	expect(screen.queryByText("npm run build")).toBeNull();
});

test("opening the list focuses the list itself, not a stop button", () => {
	render(chips([shell("dev")]));
	openList();
	expect(document.activeElement?.getAttribute("role")).toBe("dialog");
	expect(document.activeElement?.textContent).toContain("npm run dev");
});

test("a second click on stop while the first is pending sends no request", () => {
	const stops: string[] = [];
	render(
		chips([shell("dev")], (taskId) => {
			stops.push(taskId);
			return new Promise(() => {});
		}),
	);
	openList();
	const stop = screen.getByRole("button", { name: "Stop npm run dev" });
	act(() => {
		fireEvent.click(stop);
	});
	act(() => {
		fireEvent.click(stop);
	});
	expect(stops).toEqual(["dev"]);
});

test("the subagent chip counts every running subagent of the chat, nested ones included", () => {
	render(
		chips([
			subagent("review"),
			{ ...subagent("helper"), parentId: "review" },
			subagent("lint"),
			shell("dev"),
		]),
	);
	expect(
		screen.queryByRole("button", { name: /3 subagents running/ }),
	).not.toBeNull();
	expect(screen.queryByRole("button", { name: /Background/ })).not.toBeNull();
});

test("Stop all in the subagent list stops them and closes the list", () => {
	const stops: string[] = [];
	render(
		chips(
			[subagent("review"), subagent("lint")],
			async () => {},
			() => stops.push("all"),
		),
	);
	act(() => {
		fireEvent.click(
			screen.getByRole("button", { name: /2 subagents running/ }),
		);
	});
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: "Stop all" }));
	});
	expect(stops).toEqual(["all"]);
	expect(screen.queryByRole("button", { name: "Stop all" })).toBeNull();
});

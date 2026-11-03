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

const chips = (backgroundTasks: BackgroundTask[]) => (
	<ComposerChips
		backgroundTasks={backgroundTasks}
		liveRefreshKey={0}
		onOpenSubagent={() => {}}
		onStopTask={() => {}}
		runningTurnId={null}
	/>
);

test("a list left open when its last task ended stays closed for the next task", () => {
	const view = render(chips([shell("dev")]));
	act(() => {
		fireEvent.click(screen.getByRole("button", { name: /Background/ }));
	});
	expect(screen.queryByText("npm run dev")).not.toBeNull();

	view.rerender(chips([]));
	view.rerender(chips([shell("build")]));

	expect(screen.queryByRole("button", { name: /Background/ })).not.toBeNull();
	expect(screen.queryByText("npm run build")).toBeNull();
});

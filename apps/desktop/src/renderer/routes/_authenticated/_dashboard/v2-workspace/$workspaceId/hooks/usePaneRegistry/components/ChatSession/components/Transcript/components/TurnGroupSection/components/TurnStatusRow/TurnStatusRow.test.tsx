import { afterEach, expect, mock, test } from "bun:test";
import { deriveTimeline, emptySnapshot, reduceMany } from "@superset/chat/core";
import type { DurableEnvelope, DurableEvent } from "@superset/chat/protocol";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
	type TurnFailureActions,
	TurnFailureActionsProvider,
} from "../../../../../../providers/TurnFailureActionsProvider";
import { pageLinkFinder } from "../../../../../../utils/pageLinks";
import { transcriptRows } from "../../../../utils/transcriptRows";
import { TurnStatusRow } from "./TurnStatusRow";

afterEach(cleanup);

function journal(events: DurableEvent[]): DurableEnvelope[] {
	return events.map((event, index) => ({
		v: 1,
		sessionId: "s1",
		ts: index,
		cursor: { epoch: "e1", seq: index + 1 },
		event,
	}));
}

test("a reopened chat shows its failed turn as one card, and Continue continues it", () => {
	const stored = journal([
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "u1",
				kind: "user_message",
				clientId: "c1",
				startedAtMs: 1,
				content: [{ type: "text", text: "build it" }],
			},
		},
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "n1",
				kind: "notice",
				noticeKind: "error",
				text: "acp agent exited (code 1)\n\nSegmentation fault",
				startedAtMs: 3,
			},
		},
		{
			type: "turn",
			turn: {
				id: "t1",
				status: "failed",
				error: {
					message: "acp agent exited (code 1)",
					kind: "crashed",
					detail: "Segmentation fault",
				},
				startedAtMs: 2,
				completedAtMs: 4,
			},
		},
	]);
	const rows = transcriptRows(
		deriveTimeline(reduceMany(emptySnapshot(), stored)),
		[],
		new Set(),
		pageLinkFinder("https://app.superset.sh"),
	);
	const status = rows.find((row) => row.kind === "turn_status");
	if (status?.kind !== "turn_status") throw new Error("no status row");
	const continueTask = mock(() => {});
	const actions: TurnFailureActions = {
		blocked: false,
		continueTask,
		dismissed: new Set(),
		setDismissed: () => {},
	};

	const view = render(
		<TurnFailureActionsProvider value={actions}>
			<TurnStatusRow
				error={status.error}
				latest={status.latest}
				status={status.status}
				turnId={status.turnId}
			/>
		</TurnFailureActionsProvider>,
	);

	const card = view.container.querySelector('[data-turn-failure="crashed"]');
	expect(card?.textContent).toContain("The agent crashed");
	expect(card?.textContent).toContain("Segmentation fault");
	expect(rows.filter((row) => row.kind === "item").length).toBe(1);
	fireEvent.click(view.getByText("Continue"));
	expect(continueTask).toHaveBeenCalledTimes(1);
});

test("a turn the user stopped is one quiet line", () => {
	const view = render(
		<TurnStatusRow error={undefined} latest status="interrupted" turnId="t1" />,
	);
	expect(view.container.textContent).toBe("Stopped");
	expect(view.container.querySelector("[data-turn-failure]")).toBeNull();
});

test("a turn the usage limit stopped is one quiet line, not a failure card", () => {
	const view = render(
		<TurnStatusRow
			error={{ message: "You've hit your usage limit", kind: "usage_limit" }}
			latest
			status="failed"
			turnId="t1"
		/>,
	);
	expect(view.container.textContent).toBe("Stopped by the usage limit");
	expect(view.container.querySelector("[data-turn-failure]")).toBeNull();
	expect(view.queryByText("Copy error")).toBeNull();
});

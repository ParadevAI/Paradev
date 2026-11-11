import { afterEach, expect, mock, test } from "bun:test";
import type { PromptDelivery } from "@superset/chat/core";
import type {
	ApprovalRequest,
	Decision,
	UserContent,
} from "@superset/chat/protocol";
import { cleanup, renderHook } from "@testing-library/react";
import { useMainSend } from "./useMainSend";

afterEach(cleanup);

function approval(id: string, parentItemId?: string): ApprovalRequest {
	return {
		id,
		kind: "approval_request",
		targetItemId: null,
		title: id,
		status: "pending",
		startedAtMs: 1,
		...(parentItemId ? { parentItemId } : {}),
	};
}

test("sending cancels the main agent's approvals and leaves subagents' alone", () => {
	const respondToApproval = mock(
		async (_approvalId: string, _decision: Decision) => {},
	);
	const sendPrompt = mock((_content: UserContent[]) => {});
	const { result } = renderHook(() =>
		useMainSend({
			approvals: [
				approval("approval:main"),
				approval("approval:sub", "subagent:c1"),
			],
			holdPrompt: undefined,
			loaded: true,
			onAnswerFailed: () => {},
			respondToApproval,
			runningTurnId: null,
			sendIntoRunningTurn: false,
			sendPrompt,
		}),
	);

	result.current([{ type: "text", text: "why are you stuck?" }], {
		steer: false,
		draft: { segments: [], attachments: [] },
	});

	expect(respondToApproval.mock.calls).toEqual([
		["approval:main", { type: "cancel" }],
	]);
	expect(sendPrompt).toHaveBeenCalledTimes(1);
});

function renderSend({
	sendIntoRunningTurn,
	sendPrompt,
}: {
	sendIntoRunningTurn: boolean;
	sendPrompt: (
		content: UserContent[],
		delivery: PromptDelivery | undefined,
	) => unknown;
}) {
	return renderHook(() =>
		useMainSend({
			approvals: [],
			holdPrompt: undefined,
			loaded: true,
			onAnswerFailed: () => {},
			respondToApproval: async () => {},
			runningTurnId: "turn-1",
			sendIntoRunningTurn,
			sendPrompt,
		}),
	).result;
}

test("the setting sends a message into the running turn instead of queueing it", () => {
	const sendPrompt = mock(
		(_content: UserContent[], _delivery: PromptDelivery | undefined) => {},
	);
	const result = renderSend({ sendIntoRunningTurn: true, sendPrompt });

	result.current([{ type: "text", text: "also check the logs" }], {
		steer: false,
		draft: { segments: [], attachments: [] },
	});

	expect(sendPrompt.mock.calls[0]?.[1]).toEqual({
		join: { expectedTurnId: "turn-1" },
	});
});

test("without the setting a message queues behind the running turn", () => {
	const sendPrompt = mock(
		(_content: UserContent[], _delivery: PromptDelivery | undefined) => {},
	);
	const result = renderSend({ sendIntoRunningTurn: false, sendPrompt });

	result.current([{ type: "text", text: "also check the logs" }], {
		steer: false,
		draft: { segments: [], attachments: [] },
	});

	expect(sendPrompt.mock.calls[0]?.[1]).toBeUndefined();
});

test("⌘↩ interrupts the running turn whatever the setting says", () => {
	const sendPrompt = mock(
		(_content: UserContent[], _delivery: PromptDelivery | undefined) => {},
	);
	const result = renderSend({ sendIntoRunningTurn: true, sendPrompt });

	result.current([{ type: "text", text: "stop and read this" }], {
		steer: true,
		draft: { segments: [], attachments: [] },
	});

	expect(sendPrompt.mock.calls[0]?.[1]).toEqual({
		steer: { expectedTurnId: "turn-1" },
	});
});

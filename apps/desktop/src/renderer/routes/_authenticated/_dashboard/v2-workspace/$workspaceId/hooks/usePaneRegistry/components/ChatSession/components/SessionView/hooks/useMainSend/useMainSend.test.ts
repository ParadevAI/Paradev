import { afterEach, expect, mock, test } from "bun:test";
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
			sendPrompt,
		}),
	);

	result.current([{ type: "text", text: "why are you stuck?" }], {
		steer: false,
	});

	expect(respondToApproval.mock.calls).toEqual([
		["approval:main", { type: "cancel" }],
	]);
	expect(sendPrompt).toHaveBeenCalledTimes(1);
});

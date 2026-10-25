import type {
	ApprovalRequest,
	Decision,
	UserContent,
} from "@superset/chat/protocol";
import { useCallback } from "react";
import { composerAnswer } from "../../utils/composerAnswer";

export function useMainSend({
	approvals,
	holdPrompt,
	loaded,
	onAnswerFailed,
	onUserPrompt,
	respondToApproval,
	runningTurnId,
	sendPrompt,
}: {
	approvals: readonly ApprovalRequest[];
	holdPrompt: ((content: UserContent[]) => void) | undefined;
	loaded: boolean;
	onAnswerFailed: (content: UserContent[]) => void;
	onUserPrompt?: () => void;
	respondToApproval: (
		approvalId: string,
		decision: Decision,
	) => Promise<unknown>;
	runningTurnId: string | null;
	sendPrompt: (
		content: UserContent[],
		options?: { expectedTurnId: string },
	) => unknown;
}) {
	return useCallback(
		(content: UserContent[], { steer }: { steer: boolean }) => {
			onUserPrompt?.();
			if (holdPrompt) return holdPrompt(content);
			const pending = loaded
				? approvals.filter((approval) => !approval.parentItemId)
				: [];
			const [question] = pending;
			const answer =
				pending.length === 1 && question
					? composerAnswer(question, content)
					: null;
			if (question && answer) {
				return respondToApproval(question.id, answer).catch(() =>
					onAnswerFailed(content),
				);
			}
			for (const approval of pending) {
				void respondToApproval(approval.id, { type: "cancel" });
			}
			const steerTurn = steer || pending.length > 0;
			return sendPrompt(
				content,
				steerTurn && runningTurnId
					? { expectedTurnId: runningTurnId }
					: undefined,
			);
		},
		[
			holdPrompt,
			loaded,
			approvals,
			onAnswerFailed,
			onUserPrompt,
			respondToApproval,
			sendPrompt,
			runningTurnId,
		],
	);
}

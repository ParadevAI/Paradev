import type { PromptDelivery } from "@superset/chat/core";
import type {
	ApprovalRequest,
	Decision,
	UserContent,
} from "@superset/chat/protocol";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";
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
	sendIntoRunningTurn,
	sendPrompt,
}: {
	approvals: readonly ApprovalRequest[];
	holdPrompt: ((content: UserContent[]) => void) | undefined;
	loaded: boolean;
	onAnswerFailed: (draft: ComposerDraft) => void;
	onUserPrompt?: () => void;
	respondToApproval: (
		approvalId: string,
		decision: Decision,
	) => Promise<unknown>;
	runningTurnId: string | null;
	/** Enter hands the message to the running turn instead of queueing it. */
	sendIntoRunningTurn: boolean;
	sendPrompt: (
		content: UserContent[],
		delivery: PromptDelivery | undefined,
		draft: ComposerDraft,
	) => unknown;
}) {
	return useCallback(
		(
			content: UserContent[],
			{ steer, draft }: { steer: boolean; draft: ComposerDraft },
		) => {
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
					onAnswerFailed(draft),
				);
			}
			for (const approval of pending) {
				void respondToApproval(approval.id, { type: "cancel" });
			}
			const turn = runningTurnId
				? { expectedTurnId: runningTurnId }
				: undefined;
			const delivery: PromptDelivery | undefined = !turn
				? undefined
				: steer || pending.length > 0
					? { steer: turn }
					: sendIntoRunningTurn
						? { join: turn }
						: undefined;
			return sendPrompt(content, delivery, draft);
		},
		[
			holdPrompt,
			loaded,
			approvals,
			onAnswerFailed,
			onUserPrompt,
			respondToApproval,
			sendIntoRunningTurn,
			sendPrompt,
			runningTurnId,
		],
	);
}

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { TurnFailureKind } from "@superset/chat/protocol";

export type FailureAction =
	| "continue"
	| "change_model"
	| "sign_in"
	| "new_chat";

export const FAILURE_TITLES: Record<TurnFailureKind, MessageDescriptor> = {
	crashed: msg({ message: "The agent crashed" }),
	timeout: msg({ message: "The agent stopped responding" }),
	auth: msg({ message: "Sign in to continue" }),
	network: msg({ message: "Couldn't reach the model provider" }),
	model_unavailable: msg({ message: "This model isn't available" }),
	context_too_long: msg({
		message: "This conversation is too long for the model",
	}),
	refused: msg({ message: "The model declined to continue" }),
	usage_limit: msg({ message: "Stopped by the usage limit" }),
	session_lost: msg({ message: "The agent lost this conversation" }),
	unknown: msg({ message: "Task interrupted" }),
};

/** The first action is the one most likely to get the task going again. */
export const FAILURE_ACTIONS: Record<
	TurnFailureKind,
	readonly FailureAction[]
> = {
	crashed: ["continue", "change_model"],
	timeout: ["continue", "change_model"],
	auth: ["sign_in", "continue"],
	network: ["continue", "change_model"],
	model_unavailable: ["change_model", "continue"],
	context_too_long: ["new_chat", "continue"],
	refused: ["continue", "change_model"],
	usage_limit: [],
	session_lost: ["new_chat"],
	unknown: ["continue", "change_model"],
};

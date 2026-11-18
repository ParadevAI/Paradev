import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { TurnFailureKind } from "@superset/chat/protocol";
import { CircleAlert, Gauge } from "lucide-react";

export type FailureAction =
	| "continue"
	| "change_model"
	| "sign_in"
	| "agent_settings"
	| "usage_settings"
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
	usage_limit: msg({ message: "Usage limit reached" }),
	session_lost: msg({ message: "The agent lost this conversation" }),
	host_stopped: msg({ message: "Paused when Paradev closed" }),
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
	usage_limit: ["usage_settings", "change_model", "continue"],
	session_lost: ["new_chat"],
	host_stopped: ["continue"],
	unknown: ["continue", "change_model"],
};

export const MANUAL_SIGN_IN_TITLE = msg({
	message: "The agent is signed out",
});
export const MANUAL_SIGN_IN_ACTIONS: readonly FailureAction[] = [
	"continue",
	"agent_settings",
];

export const TONES = {
	failure: {
		Icon: CircleAlert,
		card: "border-destructive/25 bg-destructive/[0.04]",
		icon: "text-destructive",
		collapsedIcon: "text-destructive/70",
		title: "text-destructive",
		primary:
			"border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50",
		dismiss:
			"text-destructive/60 hover:bg-destructive/10 hover:text-destructive",
	},
	limit: {
		Icon: Gauge,
		card: "border-warning/30 bg-warning/[0.04]",
		icon: "text-warning",
		collapsedIcon: "text-warning/80",
		title: "text-foreground",
		primary:
			"border-warning/40 text-warning hover:bg-warning/10 hover:text-warning",
		dismiss: "text-muted-foreground hover:bg-accent hover:text-foreground",
	},
};

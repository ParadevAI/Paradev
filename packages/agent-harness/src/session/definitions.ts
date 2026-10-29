import { defineQuery, defineSignal, defineUpdate } from "@temporalio/workflow";

export const AGENT_TASK_QUEUE = "agent";
export const MAX_PROMPT_CHARS = 64 * 1024;

export function sessionWorkflowId(sessionId: string): string {
	return `session/${sessionId}`;
}

export interface StartTurnInput {
	turnId: string;
	promptId: string;
	text: string;
	actingUserId?: string;
}

export interface SteerInput {
	turnId: string;
	promptId: string;
	text: string;
}

export type StartTurnResult = "accepted" | "duplicate";
export type SteerResult = "steered" | "started" | "duplicate";

export interface SessionState {
	status: "idle" | "running";
	turnId: string | null;
	step: number;
	activity: string | null;
	pendingTurns: number;
}

export interface AgentSessionArgs {
	sessionId: string;
	carried?: {
		pending: StartTurnInput[];
		seenPromptIds: string[];
	};
}

export const startTurnUpdate = defineUpdate<StartTurnResult, [StartTurnInput]>(
	"startTurn",
);
export const steerUpdate = defineUpdate<SteerResult, [SteerInput]>("steer");
export const interruptSignal = defineSignal<[{ turnId?: string }]>("interrupt");
export const stateQuery = defineQuery<SessionState>("state");
/** Every steer the running turn has received, in order; empty for any other turn. */
export const turnSteersQuery = defineQuery<SteerInput[], [string]>(
	"turnSteers",
);

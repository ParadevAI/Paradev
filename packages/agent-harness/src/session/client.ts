import {
	type Client,
	WithStartWorkflowOperation,
	WorkflowIdConflictPolicy,
} from "@temporalio/client";
import {
	AGENT_TASK_QUEUE,
	type AgentSessionArgs,
	interruptSignal,
	type StartTurnInput,
	type SteerInput,
	sessionWorkflowId,
	startTurnUpdate,
	steerUpdate,
} from "./definitions";

type AgentSessionWorkflow = (args: AgentSessionArgs) => Promise<void>;

function startOperation(sessionId: string) {
	return new WithStartWorkflowOperation<AgentSessionWorkflow>("agentSession", {
		workflowId: sessionWorkflowId(sessionId),
		taskQueue: AGENT_TASK_QUEUE,
		args: [{ sessionId }],
		workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
	});
}

/** Starts a turn the API just created, starting the session's workflow if it isn't running. */
export function startTurn(
	client: Client,
	sessionId: string,
	input: StartTurnInput,
) {
	return client.workflow.executeUpdateWithStart(startTurnUpdate, {
		args: [input],
		startWorkflowOperation: startOperation(sessionId),
	});
}

/** Adds a message to the session's running turn. */
export function steerTurn(
	client: Client,
	sessionId: string,
	input: SteerInput,
) {
	return client.workflow.executeUpdateWithStart(steerUpdate, {
		args: [input],
		startWorkflowOperation: startOperation(sessionId),
	});
}

export function interruptTurn(
	client: Client,
	sessionId: string,
	turnId?: string,
) {
	return client.workflow
		.getHandle(sessionWorkflowId(sessionId))
		.signal(interruptSignal, turnId ? { turnId } : {});
}

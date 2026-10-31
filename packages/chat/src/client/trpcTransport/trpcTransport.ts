import type { ChatTransport } from "../sessionClient";

type Mutation =
	| "createSession"
	| "prompt"
	| "removeQueuedPrompt"
	| "steerQueuedPrompt"
	| "updateQueuedPrompt"
	| "resumeQueue"
	| "respondToUsageLimit"
	| "cancelTurn"
	| "stopBackgroundTask"
	| "steerSubagent"
	| "backgroundSubagent"
	| "respondToApproval"
	| "setMode"
	| "setConfigOption"
	| "closeSession"
	| "forkSession"
	| "rewindSession"
	| "undoTurnFiles";

type Query =
	| "getSession"
	| "getQueue"
	| "listSessions"
	| "discoverSessions"
	| "getItems"
	| "getOutline"
	| "getItemBodies"
	| "getTurnChanges";

/** A tRPC client for the chat router, by shape rather than by router type. */
export type ChatTrpcClient = {
	[K in Mutation]: { mutate: ChatTransport[K] };
} & {
	[K in Query]: { query: ChatTransport[K] };
};

/** Each app builds its own client (auth, links); the mapping is the same. */
export function chatTransportFromTrpc(client: ChatTrpcClient): ChatTransport {
	return {
		createSession: (input) => client.createSession.mutate(input),
		prompt: (input) => client.prompt.mutate(input),
		removeQueuedPrompt: (input) => client.removeQueuedPrompt.mutate(input),
		steerQueuedPrompt: (input) => client.steerQueuedPrompt.mutate(input),
		updateQueuedPrompt: (input) => client.updateQueuedPrompt.mutate(input),
		resumeQueue: (input) => client.resumeQueue.mutate(input),
		respondToUsageLimit: (input) => client.respondToUsageLimit.mutate(input),
		cancelTurn: (input) => client.cancelTurn.mutate(input),
		stopBackgroundTask: (input) => client.stopBackgroundTask.mutate(input),
		steerSubagent: (input) => client.steerSubagent.mutate(input),
		backgroundSubagent: (input) => client.backgroundSubagent.mutate(input),
		respondToApproval: (input) => client.respondToApproval.mutate(input),
		setMode: (input) => client.setMode.mutate(input),
		setConfigOption: (input) => client.setConfigOption.mutate(input),
		closeSession: (input) => client.closeSession.mutate(input),
		forkSession: (input) => client.forkSession.mutate(input),
		rewindSession: (input) => client.rewindSession.mutate(input),
		undoTurnFiles: (input) => client.undoTurnFiles.mutate(input),
		getSession: (input) => client.getSession.query(input),
		getQueue: (input) => client.getQueue.query(input),
		listSessions: (input) => client.listSessions.query(input),
		discoverSessions: (input) => client.discoverSessions.query(input),
		getItems: (input) => client.getItems.query(input),
		getOutline: (input) => client.getOutline.query(input),
		getItemBodies: (input) => client.getItemBodies.query(input),
		getTurnChanges: (input) => client.getTurnChanges.query(input),
	};
}

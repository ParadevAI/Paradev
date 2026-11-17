import { createContext, useContext } from "react";

export type DeviceCode = {
	userCode: string;
	verificationUrl: string;
	handle: string;
	intervalSeconds: number;
};

/** How the chat signs its agent in: a login run on the agent's own host, or a credential saved for a cloud box. */
export type AgentSignIn = { label: string } & (
	| { mode: "command"; command: string }
	| {
			mode: "token";
			saveToken: (value: string) => Promise<void>;
			saveApiKey: (value: string) => Promise<void>;
	  }
	| {
			mode: "device";
			openUrl: (url: string) => void;
			startDeviceCode: () => Promise<DeviceCode>;
			/** Resolves once the person approves this code on OpenAI's page; stops on abort. */
			waitForDeviceCode: (
				code: DeviceCode,
				signal: AbortSignal,
			) => Promise<void>;
			saveApiKey: (value: string) => Promise<void>;
	  }
);

export type TurnFailureActions = {
	/** A turn is running, a prompt is on its way, or the chat is resuming. */
	blocked: boolean;
	continueTask: () => void;
	/** Opens the composer's model picker; picking a model continues the task. */
	changeModel?: () => void;
	/** Restarts the agent so a new sign-in takes effect, then continues; false when it could not. */
	restartAndContinue?: () => Promise<boolean>;
	/** Resolves false when the new chat could not be started. */
	startNewChat?: () => Promise<boolean>;
	/** The person's own script signs this agent in, so a sign-in prompt has nothing to offer. */
	manualSignIn?: boolean;
	/** Set in the viewer's own cloud workspace, where the chat can sign the agent in. */
	agentSignIn?: AgentSignIn;
	/** Opens Settings › Agents, where manual mode is turned off. */
	openAgentSettings?: () => void;
	dismissed: ReadonlySet<string>;
	setDismissed: (turnId: string, dismissed: boolean) => void;
};

const TurnFailureActionsContext = createContext<TurnFailureActions | null>(
	null,
);

export const TurnFailureActionsProvider = TurnFailureActionsContext.Provider;

/** Null where the transcript is read without a chat to act on. */
export function useTurnFailureActions(): TurnFailureActions | null {
	return useContext(TurnFailureActionsContext);
}

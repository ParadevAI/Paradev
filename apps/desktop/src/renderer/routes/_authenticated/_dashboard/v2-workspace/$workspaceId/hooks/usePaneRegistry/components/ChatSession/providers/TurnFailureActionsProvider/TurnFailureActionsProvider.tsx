import { createContext, useContext } from "react";

export type SignedInAccount = { accountLabel: string | null };

export type DeviceCode = { userCode: string; verificationUrl: string };

type SharedSignIn = {
	label: string;
	saveApiKey: (value: string) => Promise<SignedInAccount>;
	openUrl: (url: string) => void;
};

/** Signs the cloud workspace's agent in for its creator, without leaving the chat. */
export type AgentSignIn = SharedSignIn &
	(
		| {
				agent: "claude";
				/** Returns the claude.ai page that shows the code to paste back. */
				startOauth: () => Promise<{ url: string }>;
				finishOauth: (code: string) => Promise<SignedInAccount>;
		  }
		| {
				agent: "codex";
				startDeviceCode: (plan: "personal" | "business") => Promise<DeviceCode>;
				/** Resolves once the person approves this code on OpenAI's page; stops on abort. */
				waitForDeviceCode: (
					code: DeviceCode,
					signal: AbortSignal,
				) => Promise<SignedInAccount>;
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

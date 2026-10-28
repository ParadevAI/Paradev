import { createContext, useContext } from "react";

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

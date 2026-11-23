import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { SessionConfigOption, UserContent } from "@superset/chat/protocol";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
	AgentSignIn,
	TurnFailureActions,
} from "../../../../providers/TurnFailureActionsProvider";
import type { AccountSwitch } from "../../../UsageAccountMenu";

const CONTINUE: UserContent[] = [{ type: "text", text: CONTINUE_PROMPT }];

export function useFailureRecovery({
	accountSwitch,
	blocked,
	canSwitchAgent = false,
	configOptions,
	manualSignIn,
	openAgentSettings,
	agentSignIn,
	lastPrompt,
	onRestartAndContinue,
	onStartNewChat,
	openModelPicker,
	resumeAfterLimit,
	sendPrompt,
	setConfigOption,
}: {
	accountSwitch?: AccountSwitch | undefined;
	blocked: boolean;
	canSwitchAgent?: boolean;
	configOptions: SessionConfigOption[] | undefined;
	manualSignIn?: boolean;
	openAgentSettings?: () => void;
	agentSignIn?: AgentSignIn;
	/** Resent after a restart for a sign-in: the agent never ran it. */
	lastPrompt?: string;
	onRestartAndContinue?: ((prompt: string) => Promise<boolean>) | undefined;
	onStartNewChat?: (() => Promise<boolean>) | undefined;
	openModelPicker: () => void;
	/** Set while a usage limit holds the session: another model can lift it. */
	resumeAfterLimit?: (() => void) | undefined;
	sendPrompt: (content: UserContent[]) => unknown;
	setConfigOption: (
		configId: string,
		value: string,
		options?: { confirm?: boolean },
	) => Promise<void>;
}) {
	const continueAfterModelPick = useRef(false);
	const [dismissed, setDismissedSet] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const continueTask = useCallback(() => {
		sendPrompt(CONTINUE);
	}, [sendPrompt]);

	const onSetConfigOption = useCallback(
		(configId: string, value: string) => {
			const option = configOptions?.find((option) => option.id === configId);
			const isModel = option?.category === "model";
			const afterLimit =
				option?.currentValue !== value ? resumeAfterLimit : undefined;
			if (!isModel || (!continueAfterModelPick.current && !afterLimit)) {
				void setConfigOption(configId, value);
				return;
			}
			continueAfterModelPick.current = false;
			void setConfigOption(configId, value, { confirm: true }).then(
				afterLimit ?? continueTask,
				() => undefined,
			);
		},
		[setConfigOption, configOptions, continueTask, resumeAfterLimit],
	);
	const onModelPickerOpenChange = useCallback((open: boolean) => {
		if (!open) continueAfterModelPick.current = false;
	}, []);

	const setDismissed = useCallback(
		(turnId: string, next: boolean) =>
			setDismissedSet((previous) => {
				const updated = new Set(previous);
				if (next) updated.add(turnId);
				else updated.delete(turnId);
				return updated;
			}),
		[],
	);
	const canChangeModel =
		(canSwitchAgent && configOptions !== undefined) ||
		configOptions?.some(
			(option) => option.category === "model" && option.options.length > 1,
		) === true;
	const failureActions = useMemo<TurnFailureActions>(
		() => ({
			blocked,
			continueTask,
			...(canChangeModel
				? {
						changeModel: () => {
							continueAfterModelPick.current = true;
							openModelPicker();
						},
					}
				: {}),
			...(onRestartAndContinue
				? {
						restartAndContinue: () =>
							onRestartAndContinue(lastPrompt ?? CONTINUE_PROMPT),
					}
				: {}),
			...(onStartNewChat ? { startNewChat: onStartNewChat } : {}),
			...(manualSignIn ? { manualSignIn, openAgentSettings } : {}),
			...(agentSignIn ? { agentSignIn } : {}),
			...(accountSwitch ? { accountSwitch } : {}),
			dismissed,
			setDismissed,
		}),
		[
			blocked,
			continueTask,
			canChangeModel,
			openModelPicker,
			onRestartAndContinue,
			lastPrompt,
			onStartNewChat,
			manualSignIn,
			openAgentSettings,
			agentSignIn,
			accountSwitch,
			dismissed,
			setDismissed,
		],
	);
	return { failureActions, onSetConfigOption, onModelPickerOpenChange };
}

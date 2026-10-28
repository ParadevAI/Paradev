import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { SessionConfigOption, UserContent } from "@superset/chat/protocol";
import { useCallback, useMemo, useRef, useState } from "react";
import type { TurnFailureActions } from "../../../../providers/TurnFailureActionsProvider";

const CONTINUE: UserContent[] = [{ type: "text", text: CONTINUE_PROMPT }];

export function useFailureRecovery({
	blocked,
	configOptions,
	onRestartAndContinue,
	onStartNewChat,
	openModelPicker,
	sendPrompt,
	setConfigOption,
}: {
	blocked: boolean;
	configOptions: SessionConfigOption[] | undefined;
	onRestartAndContinue?: ((prompt: string) => Promise<boolean>) | undefined;
	onStartNewChat?: (() => Promise<boolean>) | undefined;
	openModelPicker: () => void;
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
			const isModel =
				configOptions?.find((option) => option.id === configId)?.category ===
				"model";
			if (!isModel || !continueAfterModelPick.current) {
				void setConfigOption(configId, value);
				return;
			}
			continueAfterModelPick.current = false;
			void setConfigOption(configId, value, { confirm: true }).then(
				continueTask,
				() => undefined,
			);
		},
		[setConfigOption, configOptions, continueTask],
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
				? { restartAndContinue: () => onRestartAndContinue(CONTINUE_PROMPT) }
				: {}),
			...(onStartNewChat ? { startNewChat: onStartNewChat } : {}),
			dismissed,
			setDismissed,
		}),
		[
			blocked,
			continueTask,
			canChangeModel,
			openModelPicker,
			onRestartAndContinue,
			onStartNewChat,
			dismissed,
			setDismissed,
		],
	);
	return { failureActions, onSetConfigOption, onModelPickerOpenChange };
}

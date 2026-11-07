import { expect, mock, test } from "bun:test";
import { CONTINUE_PROMPT } from "@superset/chat/core";
import type { SessionConfigOption, UserContent } from "@superset/chat/protocol";
import { act, renderHook } from "@testing-library/react";
import { useFailureRecovery } from "./useFailureRecovery";

const MODEL: SessionConfigOption = {
	id: "model",
	label: "Model",
	category: "model",
	currentValue: "sonnet",
	options: [
		{ id: "sonnet", label: "Sonnet" },
		{ id: "opus", label: "Opus" },
	],
};
const CONTINUE: UserContent[] = [{ type: "text", text: CONTINUE_PROMPT }];

function setup() {
	const sendPrompt = mock((_content: UserContent[]) => {});
	const openModelPicker = mock(() => {});
	let finishSet = () => {};
	let refuseSet = () => {};
	const setConfigOption = mock(
		(_configId: string, _value: string, _options?: { confirm?: boolean }) =>
			new Promise<void>((resolve, reject) => {
				finishSet = resolve;
				refuseSet = () => reject(new Error("refused"));
			}),
	);
	const hook = renderHook(() =>
		useFailureRecovery({
			blocked: false,
			configOptions: [MODEL],
			openModelPicker,
			sendPrompt,
			setConfigOption,
		}),
	);
	return {
		hook,
		sendPrompt,
		openModelPicker,
		setConfigOption,
		finish: () => finishSet(),
		refuse: () => refuseSet(),
	};
}

test("Continue sends the continue prompt", () => {
	const { hook, sendPrompt } = setup();
	hook.result.current.failureActions.continueTask();
	expect(sendPrompt.mock.calls).toEqual([[CONTINUE]]);
});

test("a model picked after Change model continues once the agent has it", async () => {
	const { hook, sendPrompt, openModelPicker, finish } = setup();

	hook.result.current.failureActions.changeModel?.();
	hook.result.current.onModelPickerOpenChange(false);
	hook.result.current.onSetConfigOption("model", "opus");
	await act(async () => finish());
	expect(sendPrompt).not.toHaveBeenCalled();

	hook.result.current.failureActions.changeModel?.();
	hook.result.current.onSetConfigOption("model", "opus");
	expect(sendPrompt).not.toHaveBeenCalled();
	await act(async () => finish());
	expect(openModelPicker).toHaveBeenCalledTimes(2);
	expect(sendPrompt.mock.calls).toEqual([[CONTINUE]]);
});

test("a model the agent refuses does not continue the task", async () => {
	const { hook, sendPrompt, setConfigOption, refuse } = setup();

	hook.result.current.failureActions.changeModel?.();
	hook.result.current.onSetConfigOption("model", "opus");
	await act(async () => refuse());

	expect(setConfigOption.mock.calls).toEqual([
		["model", "opus", { confirm: true }],
	]);
	expect(sendPrompt).not.toHaveBeenCalled();
});

import type { SessionConfigOption } from "@superset/chat/protocol";
import { DEFAULT_ALIAS_MODEL_ID } from "@superset/shared/agent-models";
import { fastOption } from "../toggleOption";

export function currentLabel(option: SessionConfigOption | undefined) {
	return option?.options.find((entry) => entry.id === option.currentValue)
		?.label;
}

/** A runtime's default alias describes itself with the model it resolves to. */
export function currentModelLabel(option: SessionConfigOption | undefined) {
	const current = option?.options.find(
		(entry) => entry.id === option.currentValue,
	);
	return current?.id === DEFAULT_ALIAS_MODEL_ID && current.description
		? current.description
		: current?.label;
}

export function configOptionLabels(configOptions: SessionConfigOption[]) {
	const model = configOptions.find(
		(option) => option.category === "model" && option.options.length > 0,
	);
	const effort = configOptions.find(
		(option) => option.category === "thought_level",
	);
	const fast = fastOption(configOptions);
	return {
		model: currentModelLabel(model) ?? model?.label,
		effort: currentLabel(effort),
		fast: fast ? fast.currentValue === "on" : undefined,
	};
}

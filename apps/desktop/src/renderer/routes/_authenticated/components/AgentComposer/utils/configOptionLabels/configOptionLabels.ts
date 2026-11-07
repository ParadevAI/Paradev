import type { SessionConfigOption } from "@superset/chat/protocol";
import { fastOption } from "../toggleOption";

export function currentLabel(option: SessionConfigOption | undefined) {
	return option?.options.find((entry) => entry.id === option.currentValue)
		?.label;
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
		model: currentLabel(model) ?? model?.label,
		effort: currentLabel(effort),
		fast: fast ? fast.currentValue === "on" : undefined,
	};
}

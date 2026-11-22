import type { SessionConfigOption } from "@superset/chat/protocol";
import type {
	AgentEffortOption,
	AgentModelSupport,
} from "@superset/shared/agent-models";

export const AGENT_DEFAULT_OPTION_ID = "__agent_default__";
export const LAUNCH_MODEL_OPTION_ID = "model";
export const LAUNCH_EFFORT_OPTION_ID = "effort";

export type LaunchConfigLabels = {
	model: string;
	defaultModel: string;
	effort: string;
	defaultEffort: string;
};

type Entry = { id: string; label: string };

function withDefault(
	defaultLabel: string,
	entries: readonly Entry[],
	selected: string | null,
	defaultDescription?: string,
): Pick<SessionConfigOption, "currentValue" | "options"> {
	const options = [
		{
			id: AGENT_DEFAULT_OPTION_ID,
			label: defaultLabel,
			...(defaultDescription ? { description: defaultDescription } : {}),
		},
		...entries.map(({ id, label }) => ({ id, label })),
	];
	return {
		currentValue: entries.some((entry) => entry.id === selected)
			? (selected as string)
			: AGENT_DEFAULT_OPTION_ID,
		options,
	};
}

export function launchConfigOptions(input: {
	modelSupport: AgentModelSupport | undefined;
	selectedModel: string | null;
	efforts: readonly AgentEffortOption[];
	selectedEffort: string | null;
	/** What the agent's own default effort resolves to, when its runtime says. */
	defaultEffortLabel?: string;
	labels: LaunchConfigLabels;
}): SessionConfigOption[] {
	const { labels } = input;
	const options: SessionConfigOption[] = [];
	if (input.modelSupport) {
		options.push({
			id: LAUNCH_MODEL_OPTION_ID,
			label: labels.model,
			category: "model",
			...withDefault(
				labels.defaultModel,
				input.modelSupport.models,
				input.selectedModel,
			),
		});
	}
	if (input.efforts.length > 0) {
		options.push({
			id: LAUNCH_EFFORT_OPTION_ID,
			label: labels.effort,
			category: "thought_level",
			...withDefault(
				labels.defaultEffort,
				input.efforts,
				input.selectedEffort,
				input.defaultEffortLabel,
			),
		});
	}
	return options;
}

export function launchOptionValue(value: string): string | null {
	return value === AGENT_DEFAULT_OPTION_ID ? null : value;
}

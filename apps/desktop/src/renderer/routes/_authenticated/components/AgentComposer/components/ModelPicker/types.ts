import type { CatalogModel } from "@superset/shared/agent-models";
export type AgentChoice = {
	presetId: string;
	iconId?: string;
	label: string;
	models: CatalogModel[];
	/** The model this agent runs when no model is picked, when its runtime says. */
	defaultModelLabel?: string;
	availability?: "reported" | "unknown";
	loading?: boolean;
	runtimeModels?: boolean;
	onRefresh?: () => void;
	onLoad?: () => void;
	catalogKey?: string;
};

/** Other agents the chat can move to; picking one of their models hands the conversation over. */
export type AgentSwitcher = {
	currentPresetId: string;
	/** The current agent's "no model override" option, before a session exists. */
	defaultOptionId?: string;
	agents: AgentChoice[];
	onSwitch: (
		presetId: string,
		model: { id: string; label: string } | null,
	) => void;
};

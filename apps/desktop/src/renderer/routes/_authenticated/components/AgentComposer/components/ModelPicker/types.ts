import type { CatalogModel } from "@superset/shared/agent-models";
export type AgentChoice = {
	presetId: string;
	iconId?: string;
	label: string;
	models: CatalogModel[];
	availability?: "reported" | "unknown";
	loading?: boolean;
	runtimeModels?: boolean;
	onRefresh?: () => void;
};

/** Other agents the chat can move to; picking one of their models hands the conversation over. */
export type AgentSwitcher = {
	currentPresetId: string;
	agents: AgentChoice[];
	onSwitch: (
		presetId: string,
		model: { id: string; label: string } | null,
	) => void;
};

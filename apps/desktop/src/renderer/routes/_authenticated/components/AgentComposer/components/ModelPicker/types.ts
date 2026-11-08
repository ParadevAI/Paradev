export type AgentChoice = {
	presetId: string;
	iconId?: string;
	label: string;
	models: { id: string; label: string }[];
	/** The host agent configs that chat as this agent, when there are several to pick from. */
	accounts?: { configId: string; label: string; iconId: string }[];
};

/** Other agents the chat can move to; picking one of their models hands the conversation over. */
export type AgentSwitcher = {
	currentPresetId: string;
	currentConfigId?: string;
	agents: AgentChoice[];
	onSwitch: (
		presetId: string,
		model: { id: string; label: string } | null,
		configId?: string,
	) => void;
};

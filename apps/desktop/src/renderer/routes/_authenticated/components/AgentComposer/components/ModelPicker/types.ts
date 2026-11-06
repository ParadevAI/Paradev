export type AgentChoice = {
	presetId: string;
	iconId?: string;
	label: string;
	models: { id: string; label: string }[];
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

/** The model and effort every new chat of this agent starts on, over the last pick. */
export type NewChatDefaults = {
	value: { modelId?: string; effortId?: string };
	onChange: (value: { modelId?: string; effortId?: string }) => void;
};

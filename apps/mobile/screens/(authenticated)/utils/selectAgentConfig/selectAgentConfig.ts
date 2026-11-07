export function selectAgentConfig<T extends { id: string; presetId: string }>(
	configs: readonly T[],
	presetId: string,
	_configId: string | undefined,
): T | undefined {
	return configs.find((config) => config.presetId === presetId);
}

/** A picked row counts only while it has the selected preset: a later pick on another host changes the preset. */
export function selectAgentConfig<T extends { id: string; presetId: string }>(
	configs: readonly T[],
	presetId: string,
	configId: string | undefined,
): T | undefined {
	return (
		configs.find(
			(config) => config.id === configId && config.presetId === presetId,
		) ?? configs.find((config) => config.presetId === presetId)
	);
}

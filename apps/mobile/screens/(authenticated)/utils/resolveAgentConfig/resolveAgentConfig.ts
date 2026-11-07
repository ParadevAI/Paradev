import { selectAgentConfig } from "../selectAgentConfig";

interface AgentConfigsQuery<T> {
	data: readonly T[] | undefined;
	isPending: boolean;
	refetch: (options: {
		cancelRefetch: boolean;
	}) => Promise<{ data?: readonly T[] }>;
}

export async function resolveAgentConfig<
	T extends { id: string; presetId: string },
>(
	query: AgentConfigsQuery<T>,
	presetId: string,
	pickedConfigId: string | undefined,
): Promise<T | undefined> {
	return selectAgentConfig(query.data ?? [], presetId, pickedConfigId);
}

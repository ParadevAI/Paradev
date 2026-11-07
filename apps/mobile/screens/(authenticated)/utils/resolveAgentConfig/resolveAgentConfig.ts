import { selectAgentConfig } from "../selectAgentConfig";

interface AgentConfigsQuery<T> {
	data: readonly T[] | undefined;
	isPending: boolean;
	refetch: (options: {
		cancelRefetch: boolean;
	}) => Promise<{ data?: readonly T[] }>;
}

/** Pending configs are not an answer: a row picked on this host waits for them rather than launching the preset's first row. */
export async function resolveAgentConfig<
	T extends { id: string; presetId: string },
>(
	query: AgentConfigsQuery<T>,
	presetId: string,
	pickedConfigId: string | undefined,
): Promise<T | undefined> {
	const configs =
		query.isPending && pickedConfigId
			? (await query.refetch({ cancelRefetch: false })).data
			: query.data;
	return selectAgentConfig(configs ?? [], presetId, pickedConfigId);
}

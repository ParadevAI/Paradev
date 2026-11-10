interface NamedAgent {
	id: string;
	presetId: string;
	label: string;
}

/** The agent a settings search names, as in "codex" or "claude code". */
export function agentNamedBy<Agent extends NamedAgent>(
	agents: readonly Agent[],
	query: string,
): Agent | null {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return null;
	let best: Agent | null = null;
	let bestScore = 0;
	for (const agent of agents) {
		const name = `${agent.label} ${agent.presetId}`.toLowerCase();
		const score = words.filter(
			(word) => word.length >= 3 && name.includes(word),
		).length;
		if (score > bestScore) {
			best = agent;
			bestScore = score;
		}
	}
	return best;
}

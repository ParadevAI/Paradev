export type CollisionWinner = "app" | "agent";

/**
 * Who keeps a name both sides offer. The agent keeps what only it can do;
 * the app takes what it does better. A name missing here goes to the agent.
 */
export const COLLISION_WINNERS: Readonly<Record<string, CollisionWinner>> = {
	new: "app",
	clear: "app",
	reset: "app",
	model: "app",
	fast: "app",
	plan: "app",
	default: "app",
	fork: "app",
	branch: "app",
	resume: "app",
	continue: "app",
	mcp: "app",
	status: "app",
	compact: "agent",
	review: "agent",
};

type Named = { name: string; aliases?: readonly string[] };

export type ResolvedCommands<T extends Named> = {
	app: { command: T; aliases: string[] }[];
	hiddenAgentNames: ReadonlySet<string>;
};

export function resolveCollisions<T extends Named>(
	appCommands: readonly T[],
	agentNames: readonly string[],
	winners: Readonly<Record<string, CollisionWinner>> = COLLISION_WINNERS,
): ResolvedCommands<T> {
	const agent = new Set(agentNames);
	const hiddenAgentNames = new Set<string>();
	const appWins = (name: string) => {
		if (!agent.has(name)) return true;
		if (winners[name] !== "app") return false;
		hiddenAgentNames.add(name);
		return true;
	};
	const app = appCommands.flatMap((command) =>
		appWins(command.name)
			? [{ command, aliases: (command.aliases ?? []).filter(appWins) }]
			: [],
	);
	return { app, hiddenAgentNames };
}

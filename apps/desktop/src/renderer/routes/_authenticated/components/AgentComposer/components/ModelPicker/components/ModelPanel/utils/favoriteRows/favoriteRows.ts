import type { SessionConfigOption } from "@superset/chat/protocol";
import type { FavoriteModel } from "../../../../hooks/useFavoriteModels";
import type { AgentChoice } from "../../../../types";

type FavoriteRow = FavoriteModel & { agentLabel: string };

export function favoriteRows({
	favorites,
	agents,
	currentPresetId,
	model,
}: {
	favorites: FavoriteModel[];
	agents: AgentChoice[];
	currentPresetId: string;
	model: SessionConfigOption | undefined;
}): FavoriteRow[] {
	return favorites.flatMap((favorite) => {
		const agent = agents.find((entry) => entry.presetId === favorite.presetId);
		if (!agent) return [];
		// Favorites are kept per agent, not per host, so the session can lack them.
		const unavailable =
			favorite.presetId === currentPresetId &&
			model !== undefined &&
			!model.options.some((option) => option.id === favorite.id);
		return unavailable ? [] : [{ ...favorite, agentLabel: agent.label }];
	});
}

import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useChannelCoordinatorStore } from "../../stores/channelCoordinatorStore";
import { asksYou } from "../../utils/asksYou";
import { previewLine } from "../../utils/previewLine";
import { lastMessageQuery } from "../useAgentSession";

export interface CoordinatorPreview {
	/** The first line of what the coordinator last said. */
	line: string;
	/** When it said it, host clock; null while unknown. */
	at: number | null;
	/** It ended on a question or a choice, and nobody has answered yet. */
	asks: boolean;
}

interface Target {
	channelId: string;
	hostUrl: string;
	workspaceId: string;
	sessionId: string;
}

const NO_PREVIEWS: ReadonlyMap<string, CoordinatorPreview> = new Map();

/** What each channel's coordinator last said, by channel id, for the rows that list channels. */
export function useCoordinatorPreviews(
	channelIds: readonly string[],
): ReadonlyMap<string, CoordinatorPreview> {
	const byChannelId = useChannelCoordinatorStore((state) => state.byChannelId);
	const { all } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const { cache } = useHostWorkspaces();
	const targets = useMemo(
		() =>
			channelIds.flatMap((channelId): Target[] => {
				const coordinator = byChannelId[channelId];
				if (!coordinator?.sessionId) return [];
				const workspace = all.find((row) => row.id === coordinator.workspaceId);
				const hostUrl = workspace
					? cache.resolveHostUrl(workspace.hostId)
					: null;
				if (!hostUrl) return [];
				return [
					{
						channelId,
						hostUrl,
						workspaceId: coordinator.workspaceId,
						sessionId: coordinator.sessionId,
					},
				];
			}),
		[channelIds, byChannelId, all, cache],
	);
	const combine = useCallback(
		(
			results: readonly {
				data?: {
					text: string;
					at: number | null;
					complete: boolean;
					answered: boolean;
				} | null;
			}[],
		) => {
			const previews = new Map<string, CoordinatorPreview>();
			targets.forEach((target, index) => {
				const last = results[index]?.data;
				const line = last ? previewLine(last.text) : null;
				if (!last || !line) return;
				previews.set(target.channelId, {
					line,
					at: last.at,
					asks: last.complete && !last.answered && asksYou(last.text),
				});
			});
			return previews.size > 0 ? previews : NO_PREVIEWS;
		},
		[targets],
	);
	return useQueries({
		queries: targets.map((target) =>
			lastMessageQuery(target.hostUrl, target.workspaceId, target.sessionId),
		),
		combine,
	});
}

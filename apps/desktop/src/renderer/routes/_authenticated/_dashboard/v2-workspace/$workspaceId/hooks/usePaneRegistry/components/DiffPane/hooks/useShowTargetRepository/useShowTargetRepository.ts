import { useEffect, useRef } from "react";
import type { ChangesRepositoryPicker } from "../../../../../useChangesRepositoryPicker";
import { isNewNavigation } from "./utils/isNewNavigation";
import { pickShowingRepository } from "./utils/pickShowingRepository";

const sessionStartedAt = Date.now();
const lastHandledTickByPane = new Map<string, number>();

/**
 * Adds the repository of a diff target to the repository pick when the pick
 * hides it, once per navigation. The user can hide it again after that.
 */
export function useShowTargetRepository({
	paneId,
	repositoryIds,
	picker,
	targetRepositoryId,
	targetTick,
}: {
	paneId: string;
	repositoryIds: string[];
	picker: ChangesRepositoryPicker;
	targetRepositoryId: string | undefined;
	targetTick: number | undefined;
}) {
	const latestRef = useRef({ repositoryIds, picker });
	latestRef.current = { repositoryIds, picker };

	useEffect(() => {
		if (!targetRepositoryId) return;
		const isNew = isNewNavigation({
			tick: targetTick,
			lastHandledTick: lastHandledTickByPane.get(paneId),
			sessionStartedAt,
		});
		if (!isNew || targetTick === undefined) return;
		lastHandledTickByPane.set(paneId, targetTick);
		const { repositoryIds, picker } = latestRef.current;
		const nextPick = pickShowingRepository(
			repositoryIds,
			picker.shown,
			targetRepositoryId,
		);
		if (nextPick) picker.pick(nextPick);
	}, [paneId, targetRepositoryId, targetTick]);
}

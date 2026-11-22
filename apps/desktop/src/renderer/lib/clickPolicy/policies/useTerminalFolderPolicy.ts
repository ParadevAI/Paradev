import { useCallback, useMemo } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import { withPlainDefault } from "../tiers";
import type { ModifierEvent, TierMode } from "../types";
import { FOLDER_LINK_PLAIN_DEFAULT } from "./agentOutputLinks";
import {
	type FolderIntent,
	type FolderTierMap,
	folderIntentForMap,
} from "./folderPolicy";

export interface FolderClickPolicy {
	getIntent: (event: ModifierEvent) => FolderIntent;
	map: FolderTierMap;
}

/** Settings-driven click policy for folder links in terminal and chat output. */
export function useTerminalFolderPolicy(
	mode: TierMode = "4-tier",
): FolderClickPolicy {
	const { preferences } = useUserPreferences();
	const stored = preferences.folderLinks;
	const map = useMemo(
		() => withPlainDefault(stored, FOLDER_LINK_PLAIN_DEFAULT),
		[stored],
	);
	const getIntent = useCallback(
		(event: ModifierEvent) => folderIntentForMap(event, map, mode),
		[map, mode],
	);
	return useMemo(() => ({ getIntent, map }), [getIntent, map]);
}

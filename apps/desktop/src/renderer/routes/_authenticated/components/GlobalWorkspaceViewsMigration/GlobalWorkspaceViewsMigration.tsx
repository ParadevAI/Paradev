import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { migrateLegacyWorkspaceViews } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";

export function GlobalWorkspaceViewsMigration() {
	const collections = useCollections();
	useEffect(() => {
		let cancelled = false;
		void collections.v2WorkspaceViews.stateWhenReady().then(() => {
			if (!cancelled) migrateLegacyWorkspaceViews(collections);
		});
		return () => {
			cancelled = true;
		};
	}, [collections]);
	return null;
}

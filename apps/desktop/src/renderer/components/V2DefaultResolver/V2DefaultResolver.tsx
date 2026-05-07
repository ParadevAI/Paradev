import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";

export function V2DefaultResolver() {
	const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);
	const isFreshInstall = useV2LocalOverrideStore((s) => s.isFreshInstall);
	const setOptInV2 = useV2LocalOverrideStore((s) => s.setOptInV2);
	const setIsFreshInstall = useV2LocalOverrideStore((s) => s.setIsFreshInstall);
	const utils = electronTrpc.useUtils();

	useEffect(() => {
		if (optInV2 !== null && isFreshInstall !== null) return;
		let cancelled = false;
		void Promise.all([
			utils.workspaces.hasAny.fetch(),
			utils.projects.hasAny.fetch(),
		]).then(([hasWorkspace, hasProject]) => {
			if (cancelled) return;
			const isFresh = !hasWorkspace && !hasProject;
			const current = useV2LocalOverrideStore.getState();
			if (current.optInV2 === null) setOptInV2(isFresh);
			if (current.isFreshInstall === null) setIsFreshInstall(isFresh);
		});
		return () => {
			cancelled = true;
		};
	}, [optInV2, isFreshInstall, setOptInV2, setIsFreshInstall, utils]);

	return null;
}

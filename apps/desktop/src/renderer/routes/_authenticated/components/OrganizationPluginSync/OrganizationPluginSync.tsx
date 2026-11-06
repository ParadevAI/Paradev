import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useState } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { usePluginCatalog } from "renderer/hooks/usePluginCatalog";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { managedPluginsKey } from "./utils/managedPluginsKey";
import { retryDelay } from "./utils/retryDelay";

let lastSyncedKey: string | null = null;

export function OrganizationPluginSync() {
	const isFlagEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const isEnabled = env.NODE_ENV === "development" || isFlagEnabled === true;
	return isEnabled ? <SyncOnCatalogChange /> : null;
}

function SyncOnCatalogChange() {
	const { plugins, isLoading, error } = usePluginCatalog();
	const organizationId = useActiveOrganizationId();
	const [failures, setFailures] = useState(0);
	const [attempt, setAttempt] = useState(0);
	const machineUtils = electronTrpc.useUtils();
	const { mutate: sync } = electronTrpc.plugins.sync.useMutation({
		onSettled: () => machineUtils.plugins.organizationVersions.invalidate(),
		onSuccess: () => setFailures(0),
		onError: () => {
			lastSyncedKey = null;
			setFailures((count) => count + 1);
		},
	});
	const key =
		isLoading || error || !organizationId
			? null
			: `${organizationId}:${managedPluginsKey(plugins)}`;

	useEffect(
		() => () => {
			lastSyncedKey = null;
		},
		[],
	);

	useEffect(() => {
		if (failures === 0) return;
		const timer = setTimeout(
			() => setAttempt((count) => count + 1),
			retryDelay(failures),
		);
		return () => clearTimeout(timer);
	}, [failures]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the sync after a failure
	useEffect(() => {
		if (key === null || key === lastSyncedKey) return;
		lastSyncedKey = key;
		sync({ organizationId: organizationId ?? undefined });
	}, [key, sync, organizationId, attempt]);

	return null;
}

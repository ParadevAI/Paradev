import { useEffect, useRef } from "react";
import { useConnector } from "renderer/components/ConnectorSection/hooks/useConnector";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/hooks/usePluginMutations";
import { usePendingPluginInstallsStore } from "renderer/routes/_authenticated/_dashboard/stores/pendingPluginInstallsStore";

export function PendingPluginInstall({
	plugin,
	connector,
}: {
	plugin: string;
	connector: string;
}) {
	const { connections } = useConnector(connector);
	const { install } = usePluginMutations();
	const removePending = usePendingPluginInstallsStore(
		(state) => state.removePending,
	);
	const connected = connections.length > 0;
	const started = useRef(false);

	useEffect(() => {
		if (!connected || started.current) return;
		started.current = true;
		removePending(plugin);
		void install(plugin);
	}, [connected, install, plugin, removePending]);

	return null;
}

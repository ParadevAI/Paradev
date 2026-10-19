import { usePendingPluginInstallsStore } from "renderer/routes/_authenticated/_dashboard/stores/pendingPluginInstallsStore";
import { PendingPluginInstall } from "./components/PendingPluginInstall";

export function PendingPluginInstalls() {
	const connectorByPlugin = usePendingPluginInstallsStore(
		(state) => state.connectorByPlugin,
	);
	return [...connectorByPlugin].map(([plugin, connector]) => (
		<PendingPluginInstall key={plugin} plugin={plugin} connector={connector} />
	));
}

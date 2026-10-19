import { create } from "zustand";

interface PendingPluginInstallsState {
	connectorByPlugin: ReadonlyMap<string, string>;
	addPending: (plugin: string, connector: string) => void;
	removePending: (plugin: string) => void;
}

export const usePendingPluginInstallsStore =
	create<PendingPluginInstallsState>()((set) => ({
		connectorByPlugin: new Map<string, string>(),
		addPending: (plugin, connector) =>
			set((state) => {
				const next = new Map(state.connectorByPlugin);
				next.set(plugin, connector);
				return { connectorByPlugin: next };
			}),
		removePending: (plugin) =>
			set((state) => {
				const next = new Map(state.connectorByPlugin);
				next.delete(plugin);
				return { connectorByPlugin: next };
			}),
	}));

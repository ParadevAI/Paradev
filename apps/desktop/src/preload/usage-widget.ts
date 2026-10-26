import { contextBridge, ipcRenderer } from "electron";
import type { WidgetSnapshot } from "shared/usage-widget/model";
export interface UsageWidgetBridge {
	snapshot: () => Promise<WidgetSnapshot>;
	resize: (height: number) => void;
	setAppearance: (
		accountId: string,
		appearance: { color: string | null; label?: string | null },
	) => Promise<void>;
	setHidden: (accountId: string | null, hidden: boolean) => Promise<void>;
	settled: (transition: number) => void;
	hover: (accountId: string | null, centerY?: number) => void;
	action: (
		action:
			| "refresh"
			| "accounts"
			| "usage"
			| "settings"
			| "expand"
			| "collapse"
			| "close",
	) => Promise<void>;
	subscribe: (listener: (snapshot: WidgetSnapshot) => void) => () => void;
}
const api: UsageWidgetBridge = {
	snapshot: () => ipcRenderer.invoke("usage-widget:snapshot"),
	setAppearance: async (accountId, appearance) => {
		await ipcRenderer.invoke("usage-widget:appearance", accountId, appearance);
	},
	setHidden: (accountId, hidden) =>
		ipcRenderer.invoke("usage-widget:visibility", accountId, hidden),
	resize: (height) => ipcRenderer.send("usage-widget:resize", height),
	settled: (transition) => ipcRenderer.send("usage-widget:settled", transition),
	hover: (accountId, centerY) =>
		ipcRenderer.send("usage-widget:hover", accountId, centerY),
	action: (action) => ipcRenderer.invoke("usage-widget:action", action),
	subscribe: (listener) => {
		const wrapped = (
			_event: Electron.IpcRendererEvent,
			snapshot: WidgetSnapshot,
		) => listener(snapshot);
		ipcRenderer.on("usage-widget:changed", wrapped);
		return () => ipcRenderer.removeListener("usage-widget:changed", wrapped);
	},
};
contextBridge.exposeInMainWorld("UsageWidget", api);

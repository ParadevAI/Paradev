import { homedir } from "node:os";
import path from "node:path";
import { app, ipcMain, type Session } from "electron";
import {
	NATIVE_MESSAGING_CHANNEL,
	NATIVE_MESSAGING_EVENT_CHANNEL,
	type NativeMessagingOp,
	type NativePortEvent,
} from "shared/browser-extension-native-messaging";
import { findNativeHost } from "./host-manifest";
import { startNativeHost } from "./native-host-process";
import {
	createNativeMessagingPorts,
	type PortOwner,
} from "./native-messaging-ports";

const EXTENSION_ID = /^[a-p]{32}$/;

/** The extension a sender belongs to, from the browser process's own record of its URL. */
export function extensionIdOf(url: string | undefined): string | null {
	if (!url) return null;
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === "chrome-extension:" && EXTENSION_ID.test(hostname)
			? hostname
			: null;
	} catch {
		return null;
	}
}

export interface NativeMessagingOptions {
	/** The extension's permissions, including those granted at runtime. */
	grantedAccess(extension: Electron.Extension): string[];
}

export function allowsNativeMessaging(
	extension: Electron.Extension | null | undefined,
	{ grantedAccess }: NativeMessagingOptions,
): boolean {
	return !!extension && grantedAccess(extension).includes("nativeMessaging");
}

/**
 * `chrome.runtime.connectNative` and `sendNativeMessage` for the extensions in
 * `session`, reached through the browser-extension-shims preload. Hosts are
 * spawned by this process, as Chrome's browser process spawns them, so a host
 * that checks its parent sees this app.
 */
export function serveNativeMessaging(
	session: Session,
	options: NativeMessagingOptions,
): void {
	const locations = {
		platform: process.platform,
		home: homedir(),
		appHostsDir: path.join(app.getPath("userData"), "NativeMessagingHosts"),
	};
	const ports = createNativeMessagingPorts({
		allowsNativeMessaging: (extensionId) =>
			allowsNativeMessaging(
				session.extensions.getExtension(extensionId),
				options,
			),
		findHost: (name, extensionId) =>
			findNativeHost(name, extensionId, locations),
		startHost: startNativeHost,
	});

	const handle = (
		owner: PortOwner,
		op: NativeMessagingOp,
		portId: number,
		arg: unknown,
	) => {
		switch (op) {
			case "connect":
				void ports.connect(owner, portId, arg);
				return;
			case "post":
				return ports.post(owner, portId, arg);
			case "disconnect":
				return ports.disconnect(owner, portId);
		}
	};

	const workers = new WeakSet<Electron.ServiceWorkerMain>();
	session.serviceWorkers.on(
		"running-status-changed",
		({ versionId, runningStatus }) => {
			if (runningStatus === "stopped") {
				ports.closeOwners((key) => key === `worker:${versionId}`);
				return;
			}
			const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
			const extensionId = extensionIdOf(worker?.scope);
			if (!worker || !extensionId || workers.has(worker)) return;
			workers.add(worker);
			const owner: PortOwner = {
				key: `worker:${versionId}`,
				extensionId,
				send: (portId, event) => {
					if (!worker.isDestroyed()) {
						worker.send(NATIVE_MESSAGING_EVENT_CHANNEL, portId, event);
					}
				},
				// Chrome keeps a worker alive while it has a native port open.
				keepAlive: () => {
					try {
						const task = worker.startTask();
						return () => task.end();
					} catch (error) {
						console.warn(
							`[native-messaging] Cannot keep worker ${versionId} alive:`,
							error,
						);
						return () => {};
					}
				},
			};
			worker.ipc.on(NATIVE_MESSAGING_CHANNEL, (_event, op, portId, arg) =>
				handle(owner, op, portId, arg),
			);
		},
	);

	const watched = new WeakSet<Electron.WebContents>();
	const watch = (contents: Electron.WebContents) => {
		if (watched.has(contents)) return;
		watched.add(contents);
		const prefix = `frame:${contents.id}:`;
		const closeContents = () =>
			ports.closeOwners((key) => key.startsWith(prefix));
		contents.once("destroyed", closeContents);
		contents.on("render-process-gone", closeContents);
		contents.on(
			"did-frame-navigate",
			(_event, _url, _code, _status, _isMain, processId, routingId) =>
				ports.closeOwners(
					(key) => key === `${prefix}${processId}:${routingId}`,
				),
		);
	};
	ipcMain.on(NATIVE_MESSAGING_CHANNEL, (event, op, portId, arg) => {
		const frame = event.senderFrame;
		if (event.sender.session !== session || !frame || frame.detached) return;
		const extensionId = extensionIdOf(frame.url);
		if (!extensionId) return;
		watch(event.sender);
		const owner: PortOwner = {
			key: `frame:${event.sender.id}:${frame.processId}:${frame.routingId}`,
			extensionId,
			send: (id, portEvent: NativePortEvent) => {
				if (!frame.isDestroyed() && !frame.detached) {
					frame.send(NATIVE_MESSAGING_EVENT_CHANNEL, id, portEvent);
				}
			},
			keepAlive: () => () => {},
		};
		handle(owner, op, portId, arg);
	});

	session.extensions.on("extension-unloaded", (_event, extension) =>
		ports.closeExtension(extension.id),
	);
	// Quit ends in app.exit, which skips will-quit.
	app.on("before-quit", () => ports.closeAll());
}

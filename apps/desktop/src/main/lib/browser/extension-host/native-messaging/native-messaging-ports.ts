import {
	MAX_EXTENSION_MESSAGE_LENGTH,
	NATIVE_MESSAGING_ERRORS,
	type NativePortEvent,
} from "shared/browser-extension-native-messaging";
import { extensionOrigin, type NativeHostLookup } from "./host-manifest";
import {
	MAX_PENDING_BYTES,
	type NativeHostProcess,
	type startNativeHost,
} from "./native-host-process";

/** One extension context: a service worker or an extension page's frame. */
export interface PortOwner {
	key: string;
	extensionId: string;
	send(portId: number, event: NativePortEvent): void;
	/** Keeps the context alive while a port is open; returns the release. */
	keepAlive(): () => void;
}

interface Port {
	owner: PortOwner;
	host: NativeHostProcess | null;
	queued: string[];
	queuedBytes: number;
	release: () => void;
}

export interface NativeMessagingPortsDeps {
	allowsNativeMessaging(extensionId: string): boolean;
	findHost(name: unknown, extensionId: string): Promise<NativeHostLookup>;
	startHost: typeof startNativeHost;
}

/** Native messaging ports, keyed by their owner and the owner's port id. */
export function createNativeMessagingPorts(deps: NativeMessagingPortsDeps) {
	const ports = new Map<string, Port>();
	const idOf = (owner: PortOwner, portId: number) => `${owner.key}#${portId}`;

	const end = (id: string, error?: string) => {
		const port = ports.get(id);
		if (!port) return;
		ports.delete(id);
		port.host?.close();
		port.release();
		if (error === undefined) return;
		const portId = Number(id.slice(id.lastIndexOf("#") + 1));
		port.owner.send(portId, { type: "disconnect", error });
	};

	const connect = async (owner: PortOwner, portId: number, name: unknown) => {
		const id = idOf(owner, portId);
		if (!Number.isSafeInteger(portId) || ports.has(id)) return;
		const port: Port = {
			owner,
			host: null,
			queued: [],
			queuedBytes: 0,
			release: owner.keepAlive(),
		};
		ports.set(id, port);
		try {
			const lookup = deps.allowsNativeMessaging(owner.extensionId)
				? await deps.findHost(name, owner.extensionId)
				: ({ ok: false, error: NATIVE_MESSAGING_ERRORS.forbidden } as const);
			if (ports.get(id) !== port) return;
			if (!lookup.ok) return end(id, lookup.error);
			const host = deps.startHost(
				{
					hostPath: lookup.host.path,
					origin: extensionOrigin(owner.extensionId),
				},
				{
					onMessage: (json) => owner.send(portId, { type: "message", json }),
					onClose: (error) => {
						port.host = null;
						end(id, error);
					},
				},
			);
			port.host = host;
			for (const json of port.queued.splice(0)) host.post(json);
		} catch (error) {
			console.error("[native-messaging] connect failed:", error);
			end(id, NATIVE_MESSAGING_ERRORS.failedToStart);
		}
	};

	const post = (owner: PortOwner, portId: number, json: unknown) => {
		const port = ports.get(idOf(owner, portId));
		if (!port) return;
		if (typeof json !== "string") {
			return end(idOf(owner, portId), NATIVE_MESSAGING_ERRORS.io);
		}
		const bytes = Buffer.byteLength(json);
		if (bytes > MAX_EXTENSION_MESSAGE_LENGTH) {
			return end(idOf(owner, portId), NATIVE_MESSAGING_ERRORS.io);
		}
		if (port.host) return port.host.post(json);
		port.queuedBytes += bytes;
		// The host lookup can stall; an extension could otherwise queue without limit.
		if (port.queuedBytes > MAX_PENDING_BYTES) {
			return end(idOf(owner, portId), NATIVE_MESSAGING_ERRORS.io);
		}
		port.queued.push(json);
	};

	const closeWhere = (matches: (owner: PortOwner) => boolean) => {
		for (const [id, port] of [...ports]) {
			if (matches(port.owner)) end(id);
		}
	};
	const closeOwners = (matches: (key: string) => boolean) =>
		closeWhere((owner) => matches(owner.key));

	return {
		connect,
		post,
		disconnect: (owner: PortOwner, portId: number) => end(idOf(owner, portId)),
		closeOwners,
		closeExtension: (extensionId: string) =>
			closeWhere((owner) => owner.extensionId === extensionId),
		closeAll: () => closeWhere(() => true),
		openCount: () => ports.size,
	};
}

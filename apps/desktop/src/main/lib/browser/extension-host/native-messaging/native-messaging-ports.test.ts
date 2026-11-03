import { afterAll, expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	NATIVE_MESSAGING_ERRORS,
	type NativePortEvent,
} from "shared/browser-extension-native-messaging";
import { startNativeHost } from "./native-host-process";
import {
	createNativeMessagingPorts,
	type PortOwner,
} from "./native-messaging-ports";

const ONEPASSWORD = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";
const LASTPASS = "hdokiejnpimakedhajhdlcegeplioahd";
const dir = mkdtempSync(path.join(tmpdir(), "native-host-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Echoes each message with its argv and cwd; `{"exit":true}` exits.
const hostPath = path.join(dir, "host");
writeFileSync(
	hostPath,
	`#!${process.execPath}
let pending = Buffer.alloc(0);
const send = (value) => {
	const body = Buffer.from(JSON.stringify(value));
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.length, 0);
	process.stdout.write(Buffer.concat([header, body]));
};
process.stdin.on("data", (chunk) => {
	pending = Buffer.concat([pending, chunk]);
	while (pending.length >= 4 && pending.length >= 4 + pending.readUInt32LE(0)) {
		const length = pending.readUInt32LE(0);
		const message = JSON.parse(pending.subarray(4, 4 + length).toString());
		pending = pending.subarray(4 + length);
		if (message.exit) process.exit(0);
		send({ echo: message, args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid });
	}
});
`,
);
chmodSync(hostPath, 0o755);

function fakeOwner(extensionId = ONEPASSWORD, key = "worker:1") {
	const events: [number, NativePortEvent][] = [];
	let alive = 0;
	let waiter: (() => void) | null = null;
	const owner: PortOwner = {
		key,
		extensionId,
		send: (portId, event) => {
			events.push([portId, event]);
			waiter?.();
		},
		keepAlive: () => {
			alive++;
			return () => {
				alive--;
			};
		},
	};
	const next = async () => {
		const count = events.length;
		while (events.length === count) {
			await new Promise<void>((resolve) => {
				waiter = resolve;
			});
		}
		return events[events.length - 1] as [number, NativePortEvent];
	};
	return { owner, events, next, alive: () => alive };
}

function ports(declares = true) {
	return createNativeMessagingPorts({
		declaresNativeMessaging: () => declares,
		findHost: async (name, extensionId) =>
			name === "com.example.host" && extensionId === ONEPASSWORD
				? {
						ok: true,
						host: {
							name,
							path: hostPath,
							allowedOrigins: [`chrome-extension://${ONEPASSWORD}/`],
						},
					}
				: { ok: false, error: NATIVE_MESSAGING_ERRORS.forbidden },
		startHost: startNativeHost,
	});
}

const isRunning = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

async function waitUntilStopped(pid: number) {
	for (let i = 0; i < 200 && isRunning(pid); i++) await Bun.sleep(5);
	return !isRunning(pid);
}

test("a host starts with the extension's origin in its own folder and echoes queued messages", async () => {
	const native = ports();
	const { owner, next, alive } = fakeOwner();
	const connecting = native.connect(owner, 1, "com.example.host");
	native.post(owner, 1, '{"text":"héllo"}');
	await connecting;
	expect(alive()).toBe(1);

	const [portId, event] = await next();
	expect(portId).toBe(1);
	if (event.type !== "message") throw new Error("expected a message");
	const reply = JSON.parse(event.json);
	expect(reply.echo).toEqual({ text: "héllo" });
	expect(reply.args).toEqual([`chrome-extension://${ONEPASSWORD}/`]);
	expect(reply.cwd).toBe(realpathSync(dir));

	native.disconnect(owner, 1);
	expect(alive()).toBe(0);
	expect(await waitUntilStopped(reply.pid)).toBe(true);
});

test("a host that exits disconnects the port with Chrome's error", async () => {
	const native = ports();
	const { owner, next, alive } = fakeOwner();
	await native.connect(owner, 7, "com.example.host");
	native.post(owner, 7, '{"exit":true}');
	expect(await next()).toEqual([
		7,
		{ type: "disconnect", error: NATIVE_MESSAGING_ERRORS.exited },
	]);
	expect(alive()).toBe(0);
	expect(native.openCount()).toBe(0);
});

test("an extension without the permission, or not allowed by the host, starts nothing", async () => {
	const withoutPermission = fakeOwner();
	const denied = ports(false);
	await denied.connect(withoutPermission.owner, 1, "com.example.host");
	expect(withoutPermission.events).toEqual([
		[1, { type: "disconnect", error: NATIVE_MESSAGING_ERRORS.forbidden }],
	]);

	const other = fakeOwner(LASTPASS);
	const native = ports();
	await native.connect(other.owner, 1, "com.example.host");
	expect(other.events).toEqual([
		[1, { type: "disconnect", error: NATIVE_MESSAGING_ERRORS.forbidden }],
	]);
	expect(native.openCount()).toBe(0);
	expect(other.alive()).toBe(0);
});

test("unloading the extension stops its hosts without touching another context's", async () => {
	const native = ports();
	const first = fakeOwner(ONEPASSWORD, "worker:1");
	const second = fakeOwner(ONEPASSWORD, "frame:2:3:4");
	await native.connect(first.owner, 1, "com.example.host");
	await native.connect(second.owner, 1, "com.example.host");
	native.post(first.owner, 1, "{}");
	const [, event] = await first.next();
	if (event.type !== "message") throw new Error("expected a message");
	const { pid } = JSON.parse(event.json);

	native.closeOwners((key) => key === "frame:2:3:4");
	expect(native.openCount()).toBe(1);
	native.closeExtension(ONEPASSWORD);
	expect(native.openCount()).toBe(0);
	expect(await waitUntilStopped(pid)).toBe(true);
});

test("a host that stops reading closes the port instead of buffering without limit", async () => {
	const deafPath = path.join(dir, "deaf-host");
	writeFileSync(deafPath, "#!/bin/sh\nexec sleep 30\n");
	chmodSync(deafPath, 0o755);
	const closed = new Promise<string>((resolve) => {
		const host = startNativeHost(
			{
				hostPath: deafPath,
				origin: `chrome-extension://${ONEPASSWORD}/`,
				maxPendingBytes: 1024,
			},
			{ onMessage: () => {}, onClose: resolve },
		);
		const chunk = JSON.stringify("x".repeat(256 * 1024));
		// More than a macOS pipe holds (up to 1 MiB).
		for (let i = 0; i < 16; i++) host.post(chunk);
	});
	expect(await closed).toBe(NATIVE_MESSAGING_ERRORS.io);
});

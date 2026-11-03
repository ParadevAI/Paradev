import { afterAll, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import {
	NATIVE_MESSAGING_ERRORS,
	type NativePortEvent,
} from "shared/browser-extension-native-messaging";
import { startNativeHost, terminateHost } from "./native-host-process";
import {
	createNativeMessagingPorts,
	type NativeMessagingPortsDeps,
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

function ports(
	allows = true,
	findHost: NativeMessagingPortsDeps["findHost"] = async (name, extensionId) =>
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
) {
	return createNativeMessagingPorts({
		allowsNativeMessaging: () => allows,
		findHost,
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

test("a host that stops reading is stopped instead of buffering without limit", async () => {
	const deafPath = path.join(dir, "deaf-host");
	writeFileSync(deafPath, '#!/bin/sh\necho $$ > "$0.pid"\nexec sleep 30\n');
	chmodSync(deafPath, 0o755);
	let host: ReturnType<typeof startNativeHost> | undefined;
	const closed = new Promise<string>((resolve) => {
		host = startNativeHost(
			{
				hostPath: deafPath,
				origin: `chrome-extension://${ONEPASSWORD}/`,
				maxPendingBytes: 1024,
			},
			{ onMessage: () => {}, onClose: resolve },
		);
	});
	let pid = 0;
	for (let i = 0; i < 200 && !pid; i++) {
		try {
			pid = Number(readFileSync(`${deafPath}.pid`, "utf8"));
		} catch {}
		if (!pid) await Bun.sleep(5);
	}
	expect(pid).toBeGreaterThan(0);
	const chunk = JSON.stringify("x".repeat(256 * 1024));
	// Outgrows the pipe (up to 1 MiB on macOS), so frames stay unsent.
	for (let i = 0; i < 16; i++) host?.post(chunk);
	expect(await closed).toBe(NATIVE_MESSAGING_ERRORS.io);
	expect(await waitUntilStopped(pid)).toBe(true);
});

// A spawned host whose stdin takes every write but `write` decides the outcome.
function fakeSpawn(write: (callback: (error?: Error) => void) => void) {
	const signals: (NodeJS.Signals | number | undefined)[] = [];
	const child = Object.assign(new EventEmitter(), {
		pid: 99999,
		exitCode: null as number | null,
		signalCode: null as NodeJS.Signals | null,
		stdin: new Writable({
			write: (_chunk, _encoding, callback) => write(callback),
		}),
		stdout: new PassThrough(),
		kill(signal?: NodeJS.Signals | number) {
			signals.push(signal);
			child.signalCode = "SIGTERM";
			queueMicrotask(() => {
				child.emit("exit", null, "SIGTERM");
				child.emit("close", null, "SIGTERM");
			});
			return true;
		},
	});
	const spawn = spyOn(childProcess, "spawn").mockImplementation(
		(() => child) as unknown as typeof childProcess.spawn,
	);
	return { signals, restore: () => spawn.mockRestore() };
}

function startFakeHost(maxPendingBytes?: number) {
	let result: string | undefined;
	const host = startNativeHost(
		{
			hostPath: "/fake/host",
			origin: `chrome-extension://${ONEPASSWORD}/`,
			maxPendingBytes,
		},
		{
			onMessage: () => {},
			onClose: (error) => {
				result = error;
			},
		},
	);
	return { host, result: () => result };
}

test("unsent input is capped counting the frame being added, but one large frame still goes out", () => {
	const fake = fakeSpawn(() => {});
	try {
		const large = startFakeHost(1024);
		large.host.post(JSON.stringify("x".repeat(4096)));
		expect(large.result()).toBeUndefined();
		large.host.close();

		const small = startFakeHost(1024);
		const chunk = JSON.stringify("x".repeat(600));
		small.host.post(chunk);
		expect(small.result()).toBeUndefined();
		small.host.post(chunk);
		expect(small.result()).toBe(NATIVE_MESSAGING_ERRORS.io);
	} finally {
		fake.restore();
	}
});

test("a host that closes its input ends the port and is stopped", async () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const fake = fakeSpawn((callback) =>
		callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" })),
	);
	try {
		const { host, result } = startFakeHost();
		host.post("{}");
		for (let i = 0; i < 100 && result() === undefined; i++) await Bun.sleep(1);
		expect(result()).toBe(NATIVE_MESSAGING_ERRORS.io);
		expect(fake.signals).toEqual(["SIGTERM"]);
	} finally {
		fake.restore();
		warn.mockRestore();
	}
});

test("a host that cannot start says why", async () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		const closed = await new Promise<string>((resolve) =>
			startNativeHost(
				{
					hostPath: path.join(dir, "missing-host"),
					origin: `chrome-extension://${ONEPASSWORD}/`,
				},
				{ onMessage: () => {}, onClose: resolve },
			),
		);
		expect(closed).toBe(NATIVE_MESSAGING_ERRORS.failedToStart);
		expect(String(warn.mock.calls.flat())).toContain("ENOENT");
	} finally {
		warn.mockRestore();
	}
});

test("on Windows the host's whole process tree is stopped, not just cmd.exe", () => {
	const execFile = spyOn(childProcess, "execFile").mockImplementation(
		(() => {}) as unknown as typeof childProcess.execFile,
	);
	try {
		const kill = (() => true) as unknown as (
			signal?: NodeJS.Signals,
		) => boolean;
		terminateHost({ pid: 4321, kill }, "win32", "SIGTERM");
		expect(execFile.mock.calls[0]?.slice(0, 2)).toEqual([
			"taskkill",
			["/pid", "4321", "/T", "/F"],
		]);
	} finally {
		execFile.mockRestore();
	}
});

test("a failed host lookup disconnects the port with an error", async () => {
	const error = spyOn(console, "error").mockImplementation(() => {});
	try {
		const native = ports(true, async () => {
			throw new Error("lookup failed");
		});
		const { owner, events, alive } = fakeOwner();
		await native.connect(owner, 3, "com.example.host");
		expect(events).toEqual([
			[3, { type: "disconnect", error: NATIVE_MESSAGING_ERRORS.failedToStart }],
		]);
		expect(alive()).toBe(0);
		expect(native.openCount()).toBe(0);
	} finally {
		error.mockRestore();
	}
});

test("messages are limited in UTF-8 bytes, and so is the queue while a host is looked up", async () => {
	const pending = () => ports(true, () => new Promise(() => {}));
	const wide = pending();
	const first = fakeOwner();
	void wide.connect(first.owner, 1, "com.example.host");
	// 25M characters, but 75 MB of UTF-8.
	wide.post(first.owner, 1, JSON.stringify("日".repeat(25 * 1024 * 1024)));
	expect(first.events).toEqual([
		[1, { type: "disconnect", error: NATIVE_MESSAGING_ERRORS.io }],
	]);

	const queue = pending();
	const second = fakeOwner();
	void queue.connect(second.owner, 1, "com.example.host");
	const large = JSON.stringify("x".repeat(60 * 1024 * 1024));
	queue.post(second.owner, 1, large);
	queue.post(second.owner, 1, large);
	expect(second.events).toEqual([]);
	queue.post(second.owner, 1, large);
	expect(second.events).toEqual([
		[1, { type: "disconnect", error: NATIVE_MESSAGING_ERRORS.io }],
	]);
	expect(second.alive()).toBe(0);
});

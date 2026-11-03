import { type ChildProcess, execFile, spawn } from "node:child_process";
import path from "node:path";
import { NATIVE_MESSAGING_ERRORS } from "shared/browser-extension-native-messaging";
import { createNativeMessageReader, encodeNativeMessage } from "./framing";

export interface NativeHostProcess {
	post(json: string): void;
	/** Closes the pipes and stops the host. No `onClose` follows. */
	close(): void;
}

export interface NativeHostLaunch {
	hostPath: string;
	origin: string;
	platform?: NodeJS.Platform;
	/** How long a host may take to exit after SIGTERM before SIGKILL. */
	killGraceMs?: number;
	/** Bytes the host may leave unread before the port closes. */
	maxPendingBytes?: number;
}

const KILL_GRACE_MS = 2000;
// Two of Chrome's largest messages.
export const MAX_PENDING_BYTES = 128 * 1024 * 1024;

function spawnHost(
	hostPath: string,
	origin: string,
	platform: NodeJS.Platform,
): ChildProcess {
	const options = {
		cwd: path.dirname(hostPath),
		stdio: ["pipe", "pipe", "inherit"] as ["pipe", "pipe", "inherit"],
	};
	if (platform !== "win32") return spawn(hostPath, [origin], options);
	// Chrome runs Windows hosts through cmd.exe so .bat hosts work.
	return spawn(
		process.env.ComSpec ?? "cmd.exe",
		["/d", "/s", "/c", `""${hostPath}" ${origin} --parent-window=0"`],
		{ ...options, windowsVerbatimArguments: true, windowsHide: true },
	);
}

/** On Windows the host runs under cmd.exe, so the whole tree is stopped. */
export function terminateHost(
	child: Pick<ChildProcess, "pid" | "kill">,
	platform: NodeJS.Platform,
	signal: NodeJS.Signals,
): void {
	if (platform !== "win32" || child.pid === undefined) {
		child.kill(signal);
		return;
	}
	execFile(
		"taskkill",
		["/pid", String(child.pid), "/T", "/F"],
		{ windowsHide: true },
		(error) => {
			if (error) child.kill(signal);
		},
	);
}

/** Starts a host as Chrome does: the extension's origin as its argument, its own directory as cwd. */
export function startNativeHost(
	{
		hostPath,
		origin,
		platform = process.platform,
		killGraceMs = KILL_GRACE_MS,
		maxPendingBytes = MAX_PENDING_BYTES,
	}: NativeHostLaunch,
	handlers: {
		onMessage: (json: string) => void;
		onClose: (error: string) => void;
	},
): NativeHostProcess {
	let closed = false;
	let unsentBytes = 0;
	const finish = (error: string) => {
		if (closed) return;
		closed = true;
		stop();
		handlers.onClose(error);
	};

	let child: ChildProcess;
	try {
		child = spawnHost(hostPath, origin, platform);
	} catch (error) {
		console.warn(`[native-messaging] Cannot start ${hostPath}:`, error);
		closed = true;
		queueMicrotask(() =>
			handlers.onClose(NATIVE_MESSAGING_ERRORS.failedToStart),
		);
		return { post: () => {}, close: () => {} };
	}

	const running = () => child.exitCode === null && child.signalCode === null;
	let killing = false;
	const kill = () => {
		if (killing || !running()) return;
		killing = true;
		terminateHost(child, platform, "SIGTERM");
		const timer = setTimeout(() => {
			if (running()) terminateHost(child, platform, "SIGKILL");
		}, killGraceMs);
		timer.unref?.();
		child.once("exit", () => clearTimeout(timer));
	};
	const stop = () => {
		child.stdin?.destroy();
		child.stdout?.destroy();
		kill();
	};

	let closeError: string = NATIVE_MESSAGING_ERRORS.exited;
	child.on("error", (error) => {
		console.warn(`[native-messaging] Host process error ${hostPath}:`, error);
		finish(NATIVE_MESSAGING_ERRORS.failedToStart);
	});
	// Stops a host that closed its input; stdout still drains before `close`.
	child.stdin?.on("error", (error) => {
		if (closed) return;
		console.warn("[native-messaging] Cannot write to the host:", error);
		closeError = NATIVE_MESSAGING_ERRORS.io;
		kill();
	});
	const read = createNativeMessageReader({
		onMessage: (json) => {
			if (!closed) handlers.onMessage(json);
		},
		onError: (reason) => {
			console.warn(`[native-messaging] ${reason}`);
			finish(NATIVE_MESSAGING_ERRORS.io);
		},
	});
	child.stdout?.on("data", read);
	// `close` follows the last stdout data, so every message is delivered first.
	child.on("close", () => finish(closeError));

	return {
		post: (json) => {
			if (closed) return;
			const frame = encodeNativeMessage(json);
			// A host that stops reading would otherwise buffer every frame in memory.
			if (unsentBytes > 0 && unsentBytes + frame.length > maxPendingBytes) {
				console.warn("[native-messaging] host stopped reading its input");
				finish(NATIVE_MESSAGING_ERRORS.io);
				return;
			}
			unsentBytes += frame.length;
			child.stdin?.write(frame, () => {
				unsentBytes -= frame.length;
			});
		},
		close: () => {
			if (closed) return;
			closed = true;
			stop();
		},
	};
}

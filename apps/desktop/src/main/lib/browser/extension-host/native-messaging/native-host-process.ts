import { type ChildProcess, spawn } from "node:child_process";
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
}

const KILL_GRACE_MS = 2000;

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

/** Starts a host as Chrome does: the extension's origin as its argument, its own directory as cwd. */
export function startNativeHost(
	{
		hostPath,
		origin,
		platform = process.platform,
		killGraceMs = KILL_GRACE_MS,
	}: NativeHostLaunch,
	handlers: {
		onMessage: (json: string) => void;
		onClose: (error: string) => void;
	},
): NativeHostProcess {
	let closed = false;
	const finish = (error: string) => {
		if (closed) return;
		closed = true;
		stop();
		handlers.onClose(error);
	};

	let child: ChildProcess;
	try {
		child = spawnHost(hostPath, origin, platform);
	} catch {
		closed = true;
		queueMicrotask(() =>
			handlers.onClose(NATIVE_MESSAGING_ERRORS.failedToStart),
		);
		return { post: () => {}, close: () => {} };
	}

	const stop = () => {
		child.stdin?.destroy();
		child.stdout?.destroy();
		if (child.exitCode !== null || child.signalCode !== null) return;
		child.kill("SIGTERM");
		const timer = setTimeout(() => {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL");
			}
		}, killGraceMs);
		timer.unref?.();
		child.once("exit", () => clearTimeout(timer));
	};

	child.on("error", () => finish(NATIVE_MESSAGING_ERRORS.failedToStart));
	child.stdin?.on("error", () => {});
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
	child.on("close", () => finish(NATIVE_MESSAGING_ERRORS.exited));

	return {
		post: (json) => {
			if (closed) return;
			child.stdin?.write(encodeNativeMessage(json));
		},
		close: () => {
			if (closed) return;
			closed = true;
			stop();
		},
	};
}

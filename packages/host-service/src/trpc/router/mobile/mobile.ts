import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import {
	type MobileDevicePlatform,
	mobileLastDevices,
	mobileOwnedDevices,
} from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import { deviceHubCli } from "./device-hub-runtime";
import {
	createDeviceLifecycle,
	type DeviceLifecycle,
	type DeviceRef,
	type OwnedDeviceStore,
} from "./device-lifecycle";
import {
	easSimulatorConfigured,
	listEasSimulatorSessions,
} from "./eas-simulator";

const run = promisify(execFile);

export type MobileBackend = "eas" | "local-ios" | "local-android" | "none";

async function commandExists(cmd: string): Promise<boolean> {
	try {
		await run("which", [cmd]);
		return true;
	} catch {
		return false;
	}
}

async function hasIosSimulators(): Promise<boolean> {
	if (process.platform !== "darwin") return false;
	try {
		await run("xcrun", ["simctl", "list", "devices", "-j"]);
		return true;
	} catch {
		return false;
	}
}

/** GUI-launched apps do not inherit the shell's ANDROID_HOME, and Homebrew
 * installs the SDK outside the default Android Studio location. */
function findAndroidSdk(): string | null {
	const candidates = [
		process.env.ANDROID_HOME,
		process.env.ANDROID_SDK_ROOT,
		join(homedir(), "Library/Android/sdk"),
		join(homedir(), "Android/Sdk"),
		"/opt/homebrew/share/android-commandlinetools",
		"/usr/local/share/android-commandlinetools",
	];
	for (const dir of candidates) {
		if (dir && existsSync(join(dir, "emulator"))) return dir;
	}
	return null;
}

/** What this host can show a mobile pane with: a sandbox has no local
 * toolchain, so it takes a hosted simulator; a real machine prefers
 * whichever local toolchain is installed. */
export async function detectMobileBackend(): Promise<MobileBackend> {
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") {
		return easSimulatorConfigured() ? "eas" : "none";
	}
	if (await hasIosSimulators()) return "local-ios";
	if (findAndroidSdk() || (await commandExists("adb"))) return "local-android";
	return "none";
}

/** An OS-assigned free port, so two workspaces on one machine never collide. */
async function getFreePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const { port } = address;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("could not allocate a port")));
			}
		});
	});
}

const LOCAL_SERVER_START_TIMEOUT_MS = 120_000;

async function waitForHttp(
	url: string,
	timeoutMs: number,
	signal: AbortSignal,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline && !signal.aborted) {
		try {
			const response = await fetch(url, { signal });
			if (response.status < 500) return;
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `Nothing answered ${url} within ${timeoutMs}ms`,
	});
}

/** serve-sim keeps per-simulator state under the temp dir, and any other
 * serve-sim on the machine clears it. A private temp dir keeps ours intact. */
const HUB_STATE_DIR = join(tmpdir(), `superset-device-hub-${process.pid}`);

function hubStateDir(): string {
	mkdirSync(HUB_STATE_DIR, { recursive: true });
	return HUB_STATE_DIR;
}

interface LocalHub {
	port: number;
	token: string;
}

interface LocalServer {
	ready: Promise<LocalHub>;
	stop: () => void;
}

/** One device hub per host-service, reused across pane remounts.
 * Not persisted: a host-service restart starts fresh, like its other processes. */
let localServer: LocalServer | null = null;

function stopLocalServer(): void {
	localServer?.stop();
	localServer = null;
}

function startLocalServer(): LocalServer {
	const abort = new AbortController();
	let child: ChildProcess | undefined;

	const start = async (): Promise<LocalHub> => {
		const port = await getFreePort();
		abort.signal.throwIfAborted();
		const androidSdk = findAndroidSdk();
		const cli = await deviceHubCli(hubStateDir());
		abort.signal.throwIfAborted();
		const spawned = spawn(
			process.execPath,
			[
				cli,
				"--port",
				String(port),
				// Without it any local process, or a page in a browser pane, can
				// drive the devices and run commands through the hub.
				"--require-token",
				// The default source keeps a portrait frame when the device rotates.
				"--stream-source",
				"scrcpy",
			],
			{
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "1",
					TMPDIR: hubStateDir(),
					...(androidSdk
						? { ANDROID_HOME: androidSdk, ANDROID_SDK_ROOT: androidSdk }
						: {}),
				},
			},
		);
		child = spawned;

		let stderr = "";
		spawned.stderr?.on("data", (chunk) => {
			stderr = `${stderr}${chunk}`.slice(-2000);
		});
		// The hub mints its token and prints it only in its startup link.
		const token = new Promise<string>((resolve) => {
			let stdout = "";
			spawned.stdout?.on("data", (chunk) => {
				stdout = `${stdout}${chunk}`.slice(-4000);
				const match = /[?&]token=([A-Za-z0-9._~-]+)/.exec(stdout);
				if (match?.[1]) resolve(match[1]);
			});
		});
		const exited = new Promise<never>((_, reject) => {
			spawned.on("error", reject);
			spawned.on("exit", (code, signal) => {
				if (localServer === server) localServer = null;
				reject(
					new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: [
							`expo-device-hub exited (${signal ?? `code ${code}`})`,
							stderr.trim(),
						]
							.filter(Boolean)
							.join(": "),
					}),
				);
			});
		});
		exited.catch(() => {});

		const [, hubToken] = await Promise.race([
			Promise.all([
				waitForHttp(
					`http://127.0.0.1:${port}/healthz`,
					LOCAL_SERVER_START_TIMEOUT_MS,
					abort.signal,
				),
				token,
			]),
			exited,
		]);
		return { port, token: hubToken };
	};

	const server: LocalServer = {
		ready: start(),
		stop: () => {
			abort.abort();
			child?.kill();
		},
	};
	server.ready.catch(() => {
		server.stop();
		if (localServer === server) localServer = null;
	});
	return server;
}

async function ensureLocalServer(): Promise<LocalHub> {
	localServer ??= startLocalServer();
	return await localServer.ready;
}

const hubDeviceSchema = z.object({
	id: z.string(),
	name: z.string(),
	version: z.string(),
	platform: z.enum(["ios", "android"]),
	booted: z.boolean(),
});

const hubDevicesSchema = z.object({
	simulators: z.array(hubDeviceSchema),
	emulators: z.array(hubDeviceSchema),
});

const deviceActionSchema = z.object({
	platform: z.enum(["ios", "android"]),
	id: z.string(),
	name: z.string(),
});

async function hubRequest(path: string, body?: unknown): Promise<unknown> {
	const { port, token } = await ensureLocalServer();
	const response = await fetch(`http://127.0.0.1:${port}${path}`, {
		method: body ? "POST" : "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	let result: { ok?: boolean; error?: string } = {};
	try {
		result = JSON.parse(text);
	} catch {
		// an error page; the status says what happened
	}
	if (!response.ok || result.ok === false) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error ?? `Device hub answered ${response.status}`,
		});
	}
	return result;
}

type HubDevice = z.infer<typeof hubDeviceSchema>;
type RunningDevice = DeviceRef & { device: HubDevice };

function deviceRef(device: {
	platform: MobileDevicePlatform;
	id: string;
	name: string;
}): DeviceRef {
	return {
		platform: device.platform,
		key: device.platform === "ios" ? device.id : device.name,
	};
}

async function listHubDevices(): Promise<HubDevice[]> {
	const devices = hubDevicesSchema.parse(await hubRequest("/api/devices"));
	return [...devices.simulators, ...devices.emulators];
}

const SWEEP_INTERVAL_MS = 5_000;
/** With no device of ours left, the hub stops after this long unused. */
const HUB_IDLE_MS = 5 * 60_000;
const DISPOSE_SHUTDOWN_TIMEOUT_MS = 5_000;

let lifecycle: DeviceLifecycle<RunningDevice> | null = null;
let sweeper: ReturnType<typeof setInterval> | null = null;
let sweeping = false;
let lastUsedAt = Date.now();

function ownedDeviceStore(db: HostDb): OwnedDeviceStore {
	return {
		list: () =>
			db
				.select({
					platform: mobileOwnedDevices.platform,
					key: mobileOwnedDevices.deviceKey,
				})
				.from(mobileOwnedDevices)
				.all(),
		add: (device) => {
			db.insert(mobileOwnedDevices)
				.values({
					platform: device.platform,
					deviceKey: device.key,
					bootedAt: Date.now(),
				})
				.onConflictDoNothing()
				.run();
		},
		remove: (device) => {
			db.delete(mobileOwnedDevices)
				.where(
					and(
						eq(mobileOwnedDevices.platform, device.platform),
						eq(mobileOwnedDevices.deviceKey, device.key),
					),
				)
				.run();
		},
	};
}

async function sweep(): Promise<void> {
	if (!lifecycle || sweeping) return;
	sweeping = true;
	try {
		if (lifecycle.owned().length === 0) {
			if (localServer && Date.now() - lastUsedAt > HUB_IDLE_MS) {
				stopLocalServer();
			}
			return;
		}
		const running = (await listHubDevices())
			.filter((device) => device.booted)
			.map((device) => ({ ...deviceRef(device), device }));
		await lifecycle.sweep(running);
	} catch {
		// The hub is unreachable; the next sweep tries again.
	} finally {
		sweeping = false;
	}
}

function deviceLifecycle(db: HostDb): DeviceLifecycle<RunningDevice> {
	lastUsedAt = Date.now();
	if (lifecycle) return lifecycle;
	lifecycle = createDeviceLifecycle<RunningDevice>({
		store: ownedDeviceStore(db),
		now: Date.now,
		shutdown: async ({ device }) => {
			await hubRequest("/api/devices/shutdown", {
				platform: device.platform,
				id: device.id,
				name: device.name,
			});
		},
	});
	sweeper = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
	sweeper.unref?.();
	return lifecycle;
}

/** Picks up the devices a previous run booted, so they are shut down if no
 * pane claims them. */
export function startLocalDeviceCleanup(db: HostDb): void {
	if (db.select().from(mobileOwnedDevices).limit(1).get()) deviceLifecycle(db);
}

/** Shuts down the devices this host booted, then the hub. */
export async function disposeLocalDevices(): Promise<void> {
	if (sweeper) clearInterval(sweeper);
	sweeper = null;
	const current = lifecycle;
	lifecycle = null;
	if (current && localServer && current.owned().length > 0) {
		const owned = new Set(
			current.owned().map((device) => `${device.platform}:${device.key}`),
		);
		const shutdownOwned = async () => {
			for (const device of await listHubDevices()) {
				const ref = deviceRef(device);
				if (!device.booted || !owned.has(`${ref.platform}:${ref.key}`)) {
					continue;
				}
				await hubRequest("/api/devices/shutdown", {
					platform: device.platform,
					id: device.id,
					name: device.name,
				});
				current.forget(ref);
			}
		};
		await Promise.race([
			shutdownOwned(),
			new Promise((resolve) =>
				setTimeout(resolve, DISPOSE_SHUTDOWN_TIMEOUT_MS),
			),
		]).catch(() => {});
	}
	stopLocalServer();
	await rm(HUB_STATE_DIR, { recursive: true, force: true });
}

const IOS_ORIENTATION_MESSAGE_TAG = 7;
const ROTATE_CONNECT_TIMEOUT_MS = 10_000;

/** serve-sim takes an explicit orientation as one tagged frame on the
 * simulator's input socket; it has no HTTP route for it. */
async function rotateIosSimulator(
	udid: string,
	orientation: "portrait" | "landscape_left",
): Promise<void> {
	const { port, token } = await ensureLocalServer();
	const socket = new WebSocket(
		`ws://127.0.0.1:${port}/vendor/serve-sim/helper/ws?device=${encodeURIComponent(udid)}`,
		[`serve-sim.token.${token}`],
	);
	socket.binaryType = "arraybuffer";
	try {
		await new Promise<void>((resolve, reject) => {
			const unreachable = () =>
				reject(
					new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Could not reach the simulator input socket",
					}),
				);
			const timer = setTimeout(unreachable, ROTATE_CONNECT_TIMEOUT_MS);
			socket.addEventListener(
				"open",
				() => {
					clearTimeout(timer);
					resolve();
				},
				{ once: true },
			);
			socket.addEventListener(
				"error",
				() => {
					clearTimeout(timer);
					unreachable();
				},
				{ once: true },
			);
		});
	} catch (error) {
		socket.close();
		throw error;
	}
	const payload = new TextEncoder().encode(JSON.stringify({ orientation }));
	const frame = new Uint8Array(1 + payload.length);
	frame[0] = IOS_ORIENTATION_MESSAGE_TAG;
	frame.set(payload, 1);
	socket.send(frame);
	setTimeout(() => socket.close(), 50);
}

export const mobileRouter = router({
	/** What this host can show a mobile pane with, resolved once per call —
	 * cheap (a `which` and maybe one `xcrun` call), so no caching. */
	status: protectedProcedure.query(async () => {
		return { backend: await detectMobileBackend() };
	}),

	easSessions: protectedProcedure.query(() => listEasSimulatorSessions()),

	/** Released desktop builds embed this URL in a `<webview>`. The hub lists
	 * both platforms, so `platform` no longer selects anything. */
	localSession: protectedProcedure
		.input(z.object({ platform: z.enum(["local-ios", "local-android"]) }))
		.mutation(async () => {
			const { port, token } = await ensureLocalServer();
			return { url: `http://127.0.0.1:${port}/?token=${token}` };
		}),

	/** The hub answers no cross-origin requests for its device API, so the
	 * renderer reaches it through here. `lastPicked` is the workspace's last
	 * pick, else the most recent pick on this host. */
	localDevices: protectedProcedure
		.input(z.object({ workspaceId: z.string() }).optional())
		.query(async ({ ctx, input }) => {
			deviceLifecycle(ctx.db);
			const { port, token } = await ensureLocalServer();
			const devices = await listHubDevices();
			const pick = {
				platform: mobileLastDevices.platform,
				key: mobileLastDevices.deviceKey,
			};
			const lastPicked =
				(input &&
					ctx.db
						.select(pick)
						.from(mobileLastDevices)
						.where(eq(mobileLastDevices.workspaceId, input.workspaceId))
						.get()) ??
				ctx.db
					.select(pick)
					.from(mobileLastDevices)
					.orderBy(desc(mobileLastDevices.pickedAt))
					.limit(1)
					.get() ??
				null;
			return {
				hubUrl: `http://127.0.0.1:${port}`,
				hubToken: token,
				devices,
				lastPicked,
			};
		}),

	/** A device this host boots is shut down once no pane holds it. */
	bootLocalDevice: protectedProcedure
		.input(deviceActionSchema)
		.mutation(async ({ ctx, input }) => {
			const lifecycle = deviceLifecycle(ctx.db);
			const ref = deviceRef(input);
			const current = (await listHubDevices()).find(
				(device) =>
					device.platform === ref.platform && deviceRef(device).key === ref.key,
			);
			const claimed = !current?.booted;
			if (claimed) lifecycle.claim(ref);
			try {
				await hubRequest("/api/devices/boot", input);
			} catch (error) {
				if (claimed) lifecycle.forget(ref);
				throw error;
			}
		}),

	shutdownLocalDevice: protectedProcedure
		.input(deviceActionSchema)
		.mutation(async ({ ctx, input }) => {
			deviceLifecycle(ctx.db).forget(deviceRef(input));
			await hubRequest("/api/devices/shutdown", input);
		}),

	/** Renewed by a pane while it shows the device. */
	holdLocalDevice: protectedProcedure
		.input(deviceActionSchema.extend({ holder: z.string() }))
		.mutation(({ ctx, input }) => {
			deviceLifecycle(ctx.db).hold(deviceRef(input), input.holder);
		}),

	releaseLocalDevice: protectedProcedure
		.input(deviceActionSchema.extend({ holder: z.string() }))
		.mutation(({ ctx, input }) => {
			deviceLifecycle(ctx.db).release(deviceRef(input), input.holder);
		}),

	rememberLocalDevice: protectedProcedure
		.input(deviceActionSchema.extend({ workspaceId: z.string() }))
		.mutation(({ ctx, input }) => {
			const { platform, key } = deviceRef(input);
			ctx.db
				.insert(mobileLastDevices)
				.values({
					workspaceId: input.workspaceId,
					platform,
					deviceKey: key,
					pickedAt: Date.now(),
				})
				.onConflictDoUpdate({
					target: mobileLastDevices.workspaceId,
					set: { platform, deviceKey: key, pickedAt: Date.now() },
				})
				.run();
		}),

	restartLocalHub: protectedProcedure.mutation(async () => {
		stopLocalServer();
		await ensureLocalServer();
	}),

	rotateLocalDevice: protectedProcedure
		.input(
			z.object({
				platform: z.enum(["ios", "android"]),
				id: z.string(),
				orientation: z.enum(["portrait", "landscape"]),
			}),
		)
		.mutation(async ({ input }) => {
			if (input.platform === "ios") {
				await rotateIosSimulator(
					input.id,
					input.orientation === "portrait" ? "portrait" : "landscape_left",
				);
				return;
			}
			await hubRequest(
				`/vendor/serve-emu/api/orientation?device=${encodeURIComponent(input.id)}`,
				{ orientation: input.orientation },
			);
		}),
});

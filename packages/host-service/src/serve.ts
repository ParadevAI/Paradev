import { createAdaptorServer } from "@hono/node-server";
import { moveLegacyAppHome } from "@superset/agent-setup/legacy-home-move";
import { SANDBOX_PATHS } from "@superset/shared/sandbox/contract";
import { createApp } from "./app";
import { getSupervisor, startDaemonBootstrap } from "./daemon";
import { env } from "./env";
import { installConsoleTimestamps } from "./log-timestamps";
import {
	ConfigFileSessionTokenSource,
	JwtApiAuthProvider,
	SandboxApiAuthProvider,
} from "./providers/auth";
import { LocalGitCredentialProvider } from "./providers/git";
import { PskHostAuthProvider } from "./providers/host-auth";
import { provisionAgentIntegrations } from "./runtime/agent-provisioning";
import {
	processStartedAt,
	recordBootStamp,
	startSandboxBootPhaseLog,
} from "./runtime/boot-stamps";
import { caught } from "./runtime/box-log-filter";
import { readSandboxBoxResources } from "./runtime/box-resources";
import { resolveBrowserBridgeFromEnv } from "./runtime/browser-bridge/env";
import { applyLoginShellEnvToProcess } from "./runtime/login-shell-env";
import { startSandboxAgentStatusReporter } from "./runtime/sandbox-agent-status";
import { startSandboxBoxPressureReporter } from "./runtime/sandbox-box-pressure";
import { startSandboxKeepalive } from "./runtime/sandbox-keepalive";
import { startSandboxPullRequestReporter } from "./runtime/sandbox-pull-requests";
import { startVitalsLog } from "./runtime/vitals";
import { detachFromLaunchDirectory } from "./runtime/working-directory";
import { installProcessSafetyNet, installUpgradeSocketGuard } from "./safety";
import { configureSelfUpdater } from "./self-update";
import { boxLogsEnabled, captureFatalStartupError, initSentry } from "./sentry";
import { createStandaloneShutdown } from "./standalone-shutdown";
import { startTerminalBaseEnvResolution } from "./terminal/env";
import { startTerminalReaper } from "./terminal/reaper";
import { connectRelay, type TunnelClient } from "./tunnel";

const stopping = new AbortController();
const cleanup: {
	stopServing?: () => Promise<void>;
	stopDaemon?: () => Promise<void>;
	dispose?: () => Promise<void>;
} = {};
const shutdown = createStandaloneShutdown({
	stopServing: async () => cleanup.stopServing?.(),
	stopDaemon: async () => cleanup.stopDaemon?.(),
	dispose: async () => cleanup.dispose?.(),
});

function stopOnSignal(signal: NodeJS.Signals): void {
	stopping.abort();
	void shutdown(signal);
}

async function main(): Promise<void> {
	installConsoleTimestamps();
	recordBootStamp("host.process.start", processStartedAt());
	initSentry({ organizationId: env.ORGANIZATION_ID });

	// Before anything spawns a worker thread or a child process: a host
	// started from a workspace outlives that directory (HOST-SERVICE-5D).
	detachFromLaunchDirectory();

	console.log(
		"[host-service] starting (org, port, NODE_ENV):",
		env.ORGANIZATION_ID,
		env.PORT,
		process.env.NODE_ENV ?? "unset",
	);

	const appHome = moveLegacyAppHome();
	if (appHome.move === "moved" || appHome.move === "failed") {
		console.log(
			"[host-service] app home (dir, move):",
			appHome.homeDir,
			appHome.move,
		);
	}

	// Resolve the shell-env snapshot in the background — it must not block the
	// server from listening (the login-shell probe can burn the full 8s
	// budget). PTY creation awaits waitForTerminalBaseEnv() before it reads the
	// snapshot; every other request path is unaffected.
	startTerminalBaseEnvResolution();

	// Standalone entry only: the desktop already merges the login-shell PATH
	// into hosts it spawns. Fire-and-forget for the same reason as the base-env
	// resolution above; git/gh calls racing the probe just see the launcher env
	// once, same as before this merge existed.
	void applyLoginShellEnvToProcess();

	// Fire-and-track: kick off pty-daemon spawn-or-adopt without blocking
	// host-service startup. Terminal request handlers `await
	// waitForDaemonReady(orgId)` before using the supervisor's socket path,
	// so an in-flight bootstrap doesn't race with the first terminal launch.
	// Non-terminal requests (workspaces, git, chat) are unaffected if the
	// daemon takes time to come up or fails entirely.
	const daemonBootstrap = startDaemonBootstrap(env.ORGANIZATION_ID);
	// Bootstrap already logs its errors. The host can serve non-terminal requests without it.
	void daemonBootstrap.catch(() => {});
	if (process.env.NODE_ENV === "development") {
		cleanup.stopDaemon = async () => {
			try {
				await daemonBootstrap;
			} finally {
				await getSupervisor().stop(env.ORGANIZATION_ID);
			}
		};
	}

	// Standalone entry only: the desktop provisions these itself for hosts it
	// spawns (with its per-agent disable settings); this covers CLI/systemd
	// launches, which previously had no notify hooks or shell wrappers (#6254).
	await provisionAgentIntegrations();
	if (stopping.signal.aborted) return;

	const configTokenSource = env.SUPERSET_AUTH_CONFIG_PATH
		? new ConfigFileSessionTokenSource({
				configPath: env.SUPERSET_AUTH_CONFIG_PATH,
				apiUrl: env.SUPERSET_API_URL,
			})
		: null;
	const authProvider = new JwtApiAuthProvider({
		getSessionToken: configTokenSource
			? () => configTokenSource.getSessionToken()
			: async () => env.AUTH_TOKEN,
		onInvalidateCache: configTokenSource
			? () => configTokenSource.invalidateCache()
			: undefined,
		apiUrl: env.SUPERSET_API_URL,
	});
	const apiAuthProvider =
		env.SUPERSET_HOST_RUN_MODE === "sandbox"
			? new SandboxApiAuthProvider()
			: authProvider;

	const {
		app,
		injectWebSocket,
		api,
		db,
		launchSandboxAgent,
		resumeCrashedAgents,
		readLinkedPullRequests,
		onPullRequestLinked,
		terminalAgentStore,
		dispose,
	} = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.SUPERSET_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins:
				env.SUPERSET_HOST_RUN_MODE === "sandbox"
					? "*"
					: (env.CORS_ORIGINS ?? []),
			browserBridge: resolveBrowserBridgeFromEnv(env),
		},
		providers: {
			auth: apiAuthProvider,
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
		},
	});
	cleanup.dispose = dispose;

	const relayAbort = new AbortController();
	let tunnelPromise: Promise<TunnelClient | null> = Promise.resolve(null);
	const hostname =
		env.SUPERSET_HOST_RUN_MODE === "sandbox" ? undefined : "127.0.0.1";
	const server = createAdaptorServer({ fetch: app.fetch });
	const stopServing = async () => {
		// Cancel registration retries before replacing this process.
		relayAbort.abort();
		const tunnel = await Promise.race([
			tunnelPromise,
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000)),
		]);
		tunnel?.close();
		const httpServer = server as unknown as {
			closeAllConnections?: () => void;
			close: (callback: () => void) => void;
		};
		httpServer.closeAllConnections?.();
		await Promise.race([
			new Promise<void>((resolve) => httpServer.close(() => resolve())),
			new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
		]);
	};
	cleanup.stopServing = stopServing;
	installUpgradeSocketGuard(server);
	injectWebSocket(server);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ port: env.PORT, host: hostname }, () => {
			server.off("error", reject);
			resolve();
		});
	});
	if (stopping.signal.aborted) return;
	const info = server.address();
	if (!info || typeof info === "string") {
		throw new Error("The host server did not start a TCP listener");
	}
	// Install only after the server is listening so startup throws still
	// reach `main().catch(...)` and exit with a non-zero code.
	installProcessSafetyNet();
	const address = info.address.includes(":")
		? `[${info.address}]`
		: info.address;
	console.log("[host-service] listening (address, port):", address, info.port);
	recordBootStamp("host.listening");

	startTerminalReaper(db);
	startVitalsLog();
	// A cloud workspace created with an agent starts it now: the pty daemon
	// and event bus are up, and a person opening the workspace sees the
	// agent's terminal the way they would on their own machine.
	void launchSandboxAgent();
	// A stop keeps the disk and drops every process, so nothing else on the
	// box will notice that its agents are gone.
	if (env.SUPERSET_HOST_RUN_MODE === "sandbox") void resumeCrashedAgents();
	const sandboxWorkspaceId = process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
	if (env.SUPERSET_HOST_RUN_MODE === "sandbox" && sandboxWorkspaceId) {
		startSandboxAgentStatusReporter({
			apiUrl: env.SUPERSET_API_URL,
			workspaceId: sandboxWorkspaceId,
			hostSecret: env.HOST_SERVICE_SECRET,
			store: terminalAgentStore,
		});
		startSandboxBoxPressureReporter({
			apiUrl: env.SUPERSET_API_URL,
			workspaceId: sandboxWorkspaceId,
			hostSecret: env.HOST_SERVICE_SECRET,
			read: readSandboxBoxResources,
		});
		if (boxLogsEnabled()) {
			startSandboxBootPhaseLog({ path: SANDBOX_PATHS.bootLog });
		}
		startSandboxKeepalive({
			keepalive: (pingsEveryMs) =>
				api.sandbox.keepalive.mutate({ pingsEveryMs }),
			store: terminalAgentStore,
		});
		startSandboxPullRequestReporter({
			read: readLinkedPullRequests,
			report: (pullRequests) =>
				api.cloudWorkspace.reportPullRequests.mutate({
					id: sandboxWorkspaceId,
					pullRequests,
				}),
			onLinked: onPullRequestLinked,
		});
	}

	if (env.RELAY_URL && env.SUPERSET_HOST_RUN_MODE !== "sandbox") {
		tunnelPromise = connectRelay({
			signal: relayAbort.signal,
			api,
			relayUrl: env.RELAY_URL,
			localPort: info.port,
			organizationId: env.ORGANIZATION_ID,
			authProvider,
			hostServiceSecret: env.HOST_SERVICE_SECRET,
		});
	}

	// Standalone only: this process owns its listener and relay socket, so it
	// can hand the port to a successor build (system.update). The desktop
	// entry never registers this and its host-service stays non-updatable.
	const selfUpdater = configureSelfUpdater({ stopServing });
	if (env.SUPERSET_HOST_AUTO_UPDATE && selfUpdater.status().updatable) {
		const timer = setInterval(
			() => void selfUpdater.checkForUpdates(),
			60 * 60_000,
		);
		timer.unref();
	}
}

process.on("SIGINT", () => stopOnSignal("SIGINT"));
process.on("SIGTERM", () => stopOnSignal("SIGTERM"));
void main().catch(async (error) => {
	if (stopping.signal.aborted) return;
	stopping.abort();
	console.error("[host-service] Failed to start:", caught(error));
	await shutdown("startup failure", () => captureFatalStartupError(error));
});

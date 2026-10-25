import { EventEmitter } from "node:events";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { BRAND } from "@superset/shared/brand";
import { BrowserWindow } from "electron";
import express from "express";
import { handleAuthCallback } from "lib/trpc/routers/auth/utils/auth-functions";
import { reloadThemeStateFromDisk } from "main/lib/app-state";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { env } from "shared/env.shared";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { HOOK_PROTOCOL_VERSION } from "../terminal/env";
import { renderAuthCallbackPage } from "./auth-callback-page";
import { mapEventType } from "./map-event-type";
import { resolvePaneId } from "./resolve-pane-id";
import { recordV1AgentHookEvent } from "./v1-agent-sessions";

// Re-export types for backwards compatibility
export type {
	AgentLifecycleEvent,
	NotificationIds,
} from "shared/notification-types";
export { resolvePaneId } from "./resolve-pane-id";

/**
 * The environment this server is running in.
 * Used to validate incoming hook requests and detect cross-environment issues.
 */
const SERVER_ENV =
	env.NODE_ENV === "development" ? "development" : "production";
const debugHooksOverride = process.env.SUPERSET_DEBUG_HOOKS?.trim();
const DEBUG_HOOKS_ENABLED =
	debugHooksOverride === undefined
		? SERVER_ENV === "development"
		: !/^(0|false)$/i.test(debugHooksOverride);

/**
 * Broadcasts normalized agent lifecycle events from the local hook server.
 */
export const notificationsEmitter = new EventEmitter();

const app = express();

// Parse JSON request bodies
app.use(express.json());

// CORS
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	if (req.method === "OPTIONS") {
		return res.status(200).end();
	}
	next();
});

// Agent lifecycle hook
app.get("/hook/complete", (req, res) => {
	const {
		paneId,
		tabId,
		workspaceId,
		sessionId,
		terminalId,
		hookSessionId,
		resourceId,
		eventType,
		rawEventType,
		agentId,
		env: clientEnv,
		version,
	} = req.query;

	// Environment validation: detect dev/prod cross-talk
	// We still return success to not block the agent, but log a warning
	if (clientEnv && clientEnv !== SERVER_ENV) {
		console.warn(
			`[notifications] Environment mismatch: received ${clientEnv} request on ${SERVER_ENV} server. ` +
				`This may indicate a stale hook or misconfigured terminal. Ignoring request.`,
		);
		return res.json({ success: true, ignored: true, reason: "env_mismatch" });
	}

	// Log version for debugging (helpful when troubleshooting hook issues)
	if (version && version !== HOOK_PROTOCOL_VERSION) {
		console.log(
			`[notifications] Received hook v${version} request (server expects v${HOOK_PROTOCOL_VERSION})`,
		);
	}

	const mappedEventType = mapEventType(eventType as string | undefined);

	// Unknown or missing eventType: return success but don't process
	// This ensures forward compatibility and doesn't block the agent
	if (!mappedEventType) {
		if (eventType) {
			console.log("[notifications] Ignoring unknown eventType:", eventType);
		}
		return res.json({ success: true, ignored: true });
	}

	const resolvedPaneId = resolvePaneId(
		paneId as string | undefined,
		tabId as string | undefined,
		workspaceId as string | undefined,
	);

	// v1 pane agent-session capture for the v1→v2 migration's resume seeding.
	// Needs the un-collapsed event (SessionEnd vs Stop) — only v7+ hook
	// scripts send it, so absence just means no capture.
	if (
		resolvedPaneId &&
		typeof rawEventType === "string" &&
		rawEventType.length > 0 &&
		typeof agentId === "string" &&
		agentId.length > 0
	) {
		recordV1AgentHookEvent(resolvedPaneId, {
			rawEventType,
			agentId,
			...(typeof sessionId === "string" && sessionId.length > 0
				? { agentSessionId: sessionId }
				: {}),
			at: Date.now(),
		});
	}

	const event: AgentLifecycleEvent = {
		paneId: resolvedPaneId,
		tabId: tabId as string | undefined,
		workspaceId: workspaceId as string | undefined,
		terminalId: terminalId as string | undefined,
		eventType: mappedEventType,
	};

	if (DEBUG_HOOKS_ENABLED) {
		console.log("[notifications] hook event received", {
			eventType,
			mappedEventType,
			paneId: paneId as string | undefined,
			tabId: tabId as string | undefined,
			workspaceId: workspaceId as string | undefined,
			sessionId: sessionId as string | undefined,
			terminalId: terminalId as string | undefined,
			hookSessionId: hookSessionId as string | undefined,
			resourceId: resourceId as string | undefined,
			resolvedPaneId,
		});
	}

	notificationsEmitter.emit(NOTIFICATION_EVENTS.AGENT_LIFECYCLE, event);

	res.json({ success: true, paneId: resolvedPaneId, tabId });
});

// Health check
app.get("/health", (_req, res) => {
	res.json({ status: "ok" });
});

// OAuth callback fallback for Linux/dev environments where custom URI handlers
// are unreliable. Browser can hit localhost directly to complete sign-in.
app.get("/auth/callback", async (req, res) => {
	const token = req.query.token;
	const expiresAt = req.query.expiresAt;
	const state = req.query.state;
	const appName = BRAND.NAME;
	const sendPage = (status: number, title: string, description: string) =>
		res
			.status(status)
			.type("html")
			.send(renderAuthCallbackPage({ appName, title, description }));
	const sendFailure = () =>
		sendPage(
			400,
			i18n._(msg({ message: "Sign-in didn't finish" })),
			i18n._(msg({ message: `Go back to ${appName} and sign in again.` })),
		);

	if (
		typeof token !== "string" ||
		typeof expiresAt !== "string" ||
		typeof state !== "string"
	) {
		return sendFailure();
	}

	const result = await handleAuthCallback({ token, expiresAt, state });
	if (!result.success) {
		return result.reason === "save-failed"
			? sendPage(
					500,
					i18n._(msg({ message: "Sign-in didn't finish" })),
					result.error,
				)
			: sendFailure();
	}

	const mainWindow = BrowserWindow.getAllWindows()[0];
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}

	return sendPage(
		200,
		i18n._(msg({ message: "You're signed in" })),
		i18n._(msg({ message: "You can close this tab." })),
	);
});

// External settings change (e.g. `superset settings ...` CLI). Reads no
// request data — it only re-reads local files and tells the renderer to
// refresh, so an unauthenticated localhost nudge is safe.
app.post("/settings-changed", (_req, res) => {
	const themeState = reloadThemeStateFromDisk();
	// Emit even when the theme reload failed: local.db settings may still
	// have changed, and the renderer refresh is driven by this event.
	notificationsEmitter.emit("settings-external-change", { themeState });
	res.json({ success: true, themeReloaded: themeState !== null });
});

// 404
app.use((_req, res) => {
	res.status(404).json({ error: "Not found" });
});

/**
 * Exposes the notifications Express app for startup and tests.
 */
export const notificationsApp = app;

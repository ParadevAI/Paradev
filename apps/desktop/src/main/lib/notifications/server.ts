import { EventEmitter } from "node:events";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { BRAND } from "@superset/shared/brand";
import { BrowserWindow } from "electron";
import express from "express";
import { handleAuthCallback } from "lib/trpc/routers/auth/utils/auth-functions";
import { reloadThemeStateFromDisk } from "main/lib/app-state";
import { renderAuthCallbackPage } from "./auth-callback-page";

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

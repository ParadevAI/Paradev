/**
 * Browser bridge — loopback control surface for the in-app browser panes.
 *
 * The host-service child is the only client: it learns the endpoint and
 * secret via BROWSER_BRIDGE_URL / BROWSER_BRIDGE_SECRET at spawn and proxies
 * its own authenticated `browser.*` tRPC procedures (and the raw CDP
 * WebSocket route) here. Nothing else should hold the secret, so it is never
 * written to disk.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { desktopNotificationSchema } from "@superset/shared/desktop-notification";
import {
	allLayoutTabs,
	paneLayoutRequestSchema,
} from "@superset/shared/pane-layout-ops";
import { BrowserWindow, dialog } from "electron";
import log from "electron-log";
import express, { type Request, type Response } from "express";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { showCliNotification } from "../notifications/show-cli-notification";
import {
	PaneLayoutRequestError,
	paneLayoutRequests,
} from "../pane-layout/pane-layout-requests";
import { setBrowserBridgeInfo } from "./browser-bridge-info";
import {
	type BrowserOpenRequest,
	type BrowserPaneInfo,
	browserManager,
	CdpBusyError,
	resolveGuestUrl,
} from "./browser-manager";
import {
	hasSafeStorageKey,
	importCookiesIntoSession,
} from "./chrome-cookie-import";
import {
	listLoginImportSources,
	resolveImportProfile,
} from "./chrome-history-import";

const OPEN_PANE_TIMEOUT_MS = 15_000;
const WAKE_PANE_TIMEOUT_MS = 10_000;
const MAX_CDP_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_EARLY_CDP_FRAMES = 64;
const CDP_PATH = /^\/panes\/([^/]+)\/cdp$/;
const LOGIN_IMPORT_REFUSED = "The user did not allow this login import.";
const EXTENSION_ID = /^[a-p]{32}$/;
const EXTENSION_INSTALL_REFUSED = "The user did not allow this extension.";
const EXTENSION_REMOVE_REFUSED = "The user kept this extension.";
const EXTENSION_UNANSWERED =
	"Nobody answered the question in the app in time. Nothing changed.";
// Under the relay's 65 s request limit, so a CLI that gives up never sees a later yes take effect.
const ANSWER_DEADLINE_MS = 50_000;

export interface UserExtensionSummary {
	id: string;
	name: string;
	version: string;
}

export type UserExtensionInstall =
	| {
			status: "installed" | "already-installed";
			extension: UserExtensionSummary;
	  }
	| { status: "declined" };

/** The browser panes' extensions. The CLI can manage them but never open, click or read them. */
export interface UserExtensions {
	list(): (UserExtensionSummary & { pinned: boolean })[];
	/** The question closes, as a no, when `signal` aborts. */
	install(
		extensionId: string,
		signal: AbortSignal,
	): Promise<UserExtensionInstall>;
	/** False when the user says no, or `signal` aborts first. */
	remove(extensionId: string, signal: AbortSignal): Promise<boolean>;
	setPinned(extensionId: string, pinned: boolean): void;
}

// Cookies are live sign-ins, so the user says yes to each copy.
async function confirmLoginImport(
	browserName: string,
	profileName: string,
): Promise<boolean> {
	const box: Electron.MessageBoxOptions = {
		type: "question",
		buttons: [
			i18n._(msg({ message: "Allow" })),
			i18n._(msg({ message: "Don't allow" })),
		],
		defaultId: 1,
		cancelId: 1,
		message: i18n._(
			msg({ message: `Let an agent use your ${browserName} logins?` }),
		),
		detail: i18n._(
			msg({
				message: `It copies the cookies from your "${profileName}" profile into the in-app browser. Agents can then act on the sites you are signed in to.`,
			}),
		),
	};
	const window =
		BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
	const { response } = window
		? await dialog.showMessageBox(window, box)
		: await dialog.showMessageBox(box);
	return response === 0;
}

let server: Server | null = null;

// Opens still waiting on the renderer per workspace, so a stuck renderer (each
// open waits up to OPEN_PANE_TIMEOUT_MS) cannot pile up requests without bound.
const pendingOpens = new Map<string, number>();
const MAX_PENDING_OPENS = 8;

type BrowserPaneListing = BrowserPaneInfo & { loaded: boolean };

function isAuthorized(secret: string, req: IncomingMessage): boolean {
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
	const candidate = bearer ?? url.searchParams.get("token") ?? "";
	const a = Buffer.from(candidate);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The pane's live webContents, rebuilding it first when hidden-pane eviction
 * unloaded it.
 */
async function liveWebContents(
	paneId: string,
	workspaceId: string,
	wakeTimeoutMs: number,
): Promise<Electron.WebContents | null> {
	const live = browserManager.getWebContents(paneId, workspaceId);
	if (live) return live;
	const registered = browserManager.whenRegistered(
		paneId,
		workspaceId,
		wakeTimeoutMs,
	);
	try {
		await paneLayoutRequests.request(workspaceId, {
			type: "wakeBrowser",
			paneId,
		});
	} catch (err) {
		registered.cancel();
		// Only the renderer's "no such pane" means the pane is gone; a window that
		// is not ready yet must not read as a missing pane.
		if (err instanceof PaneLayoutRequestError && err.status === 404)
			return null;
		throw err;
	}
	const wc = await registered.ready;
	if (!wc) {
		throw new PaneLayoutRequestError(
			504,
			`Browser pane ${paneId} did not finish loading in time.`,
		);
	}
	return wc;
}

/**
 * Resolve the workspace-scoped pane every pane op must name, or answer
 * the request with an error. The workspaceId is required (body for POST,
 * query for GET): the bridge never operates unscoped.
 */
async function resolvePane(
	req: Request,
	res: Response,
	wakeTimeoutMs: number,
): Promise<{
	wc: Electron.WebContents;
	paneId: string;
	workspaceId: string;
} | null> {
	const paneId = req.params.paneId as string;
	const workspaceId = req.body?.workspaceId ?? req.query.workspaceId;
	if (typeof workspaceId !== "string" || workspaceId.length === 0) {
		res.status(400).json({ error: "workspaceId is required" });
		return null;
	}
	let wc: Electron.WebContents | null;
	try {
		wc = await liveWebContents(paneId, workspaceId, wakeTimeoutMs);
	} catch (err) {
		res
			.status(err instanceof PaneLayoutRequestError ? err.status : 500)
			.json({ error: errorMessage(err) });
		return null;
	}
	if (!wc) {
		res
			.status(404)
			.json({ error: `No browser pane ${paneId} in this workspace` });
		return null;
	}
	browserManager.markUse(paneId);
	return { wc, paneId, workspaceId };
}

/** Runs `fn` on the resolved pane; a throw anywhere answers 500 instead of leaving the request open. */
function withPane(
	req: Request,
	res: Response,
	wakeTimeoutMs: number,
	fn: (pane: {
		wc: Electron.WebContents;
		paneId: string;
		workspaceId: string;
	}) => void,
): void {
	resolvePane(req, res, wakeTimeoutMs)
		.then((pane) => {
			if (pane) fn(pane);
		})
		.catch((err) => {
			if (!res.headersSent) res.status(500).json({ error: errorMessage(err) });
		});
}

async function listPanes(workspaceId: string): Promise<BrowserPaneListing[]> {
	const live = new Map(
		browserManager
			.listPanes(workspaceId)
			.map((pane) => [pane.paneId, { ...pane, loaded: true }]),
	);
	const layout = await paneLayoutRequests
		.request(workspaceId, { type: "list" })
		.then((result) => result.layout)
		.catch(() => null);
	if (!layout) return [...live.values()];
	const panes: BrowserPaneListing[] = [];
	for (const pane of allLayoutTabs(layout).flatMap((tab) => tab.panes)) {
		const listed = live.get(pane.id);
		if (listed) {
			panes.push(listed);
			live.delete(pane.id);
		} else if (pane.browser) {
			panes.push({
				paneId: pane.id,
				workspaceId,
				url: pane.browser.url,
				title: pane.title ?? "",
				isLoading: false,
				loaded: false,
			});
		}
	}
	return [...panes, ...live.values()];
}

export async function startBrowserBridge({
	homeDir,
	extensions,
	answerDeadlineMs = ANSWER_DEADLINE_MS,
	wakeTimeoutMs = WAKE_PANE_TIMEOUT_MS,
}: {
	homeDir?: string;
	extensions?: UserExtensions;
	answerDeadlineMs?: number;
	wakeTimeoutMs?: number;
} = {}): Promise<void> {
	if (server) return;
	const secret = randomBytes(32).toString("hex");
	const app = express();
	app.use(express.json({ limit: "2mb" }));

	app.use((req, res, next) => {
		if (!isAuthorized(secret, req)) {
			res.status(401).json({ error: "Unauthorized" });
			return;
		}
		next();
	});

	app.get("/panes", (req, res) => {
		const workspaceId = req.query.workspaceId;
		if (typeof workspaceId !== "string" || workspaceId.length === 0) {
			res.status(400).json({ error: "workspaceId is required" });
			return;
		}
		listPanes(workspaceId)
			.then((panes) => res.json({ panes }))
			.catch((err) => res.status(500).json({ error: errorMessage(err) }));
	});

	app.post("/open", (req, res) => {
		const { workspaceId, projectId, url, target, show } = req.body ?? {};
		if (typeof workspaceId !== "string" || typeof url !== "string") {
			res.status(400).json({ error: "workspaceId and url are required" });
			return;
		}
		const resolvedTarget = target === "new-tab" ? "new-tab" : "current-tab";
		let resolvedUrl: string;
		try {
			resolvedUrl = resolveGuestUrl(url);
		} catch (err) {
			res.status(400).json({ error: errorMessage(err) });
			return;
		}
		if ((pendingOpens.get(workspaceId) ?? 0) >= MAX_PENDING_OPENS) {
			res.status(429).json({
				error:
					"Too many pending browser-open requests for this workspace. Try again once the earlier ones settle.",
			});
			return;
		}
		pendingOpens.set(workspaceId, (pendingOpens.get(workspaceId) ?? 0) + 1);

		// The renderer names the pane it made for this requestId; the answer
		// waits until that pane is registered, so it is never another pane.
		const requestId = randomBytes(8).toString("hex");
		let registered: ReturnType<typeof browserManager.whenRegistered> | null =
			null;
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			browserManager.off(`open-resolved:${requestId}`, onResolved);
			registered?.cancel();
			const left = (pendingOpens.get(workspaceId) ?? 1) - 1;
			if (left > 0) pendingOpens.set(workspaceId, left);
			else pendingOpens.delete(workspaceId);
			fn();
		};
		const timer = setTimeout(() => {
			finish(() =>
				res.status(504).json({
					error:
						"No browser pane appeared for this workspace. Is the desktop app running and signed in?",
				}),
			);
		}, OPEN_PANE_TIMEOUT_MS);
		res.on("close", () => finish(() => {}));

		const onResolved = (paneId: string) => {
			registered = browserManager.whenRegistered(
				paneId,
				workspaceId,
				OPEN_PANE_TIMEOUT_MS,
			);
			void registered.ready.then((wc) => {
				if (!wc) return;
				const info = browserManager
					.listPanes(workspaceId)
					.find((pane) => pane.paneId === paneId);
				const loaded = info && info.url !== "about:blank" && !info.isLoading;
				finish(() =>
					res.json({
						paneId,
						url: loaded ? info.url : resolvedUrl,
						title: loaded ? info.title : "",
					}),
				);
			});
		};
		browserManager.once(`open-resolved:${requestId}`, onResolved);
		browserManager.requestOpen({
			workspaceId,
			projectId: typeof projectId === "string" ? projectId : null,
			url: resolvedUrl,
			target: resolvedTarget,
			show: show === true,
			requestId,
		} satisfies BrowserOpenRequest);
	});

	app.post("/panes/:paneId/navigate", (req, res) => {
		const url = req.body?.url;
		if (typeof url !== "string") {
			res.status(400).json({ error: "url is required" });
			return;
		}
		// A disallowed scheme is a bad request (400); a missing pane is a 404.
		let resolvedUrl: string;
		try {
			resolvedUrl = resolveGuestUrl(url);
		} catch (err) {
			res.status(400).json({ error: errorMessage(err) });
			return;
		}
		withPane(req, res, wakeTimeoutMs, (pane) => {
			try {
				browserManager.navigate(pane.paneId, resolvedUrl, pane.workspaceId);
				res.json({ ok: true });
			} catch (err) {
				res.status(404).json({ error: errorMessage(err) });
			}
		});
	});

	app.post("/panes/:paneId/back", (req, res) => {
		withPane(req, res, wakeTimeoutMs, (pane) => {
			if (pane.wc.canGoBack()) pane.wc.goBack();
			res.json({ ok: true });
		});
	});

	app.post("/panes/:paneId/forward", (req, res) => {
		withPane(req, res, wakeTimeoutMs, (pane) => {
			if (pane.wc.canGoForward()) pane.wc.goForward();
			res.json({ ok: true });
		});
	});

	app.post("/panes/:paneId/reload", (req, res) => {
		withPane(req, res, wakeTimeoutMs, (pane) => {
			if (req.body?.hard) {
				pane.wc.reloadIgnoringCache();
			} else {
				pane.wc.reload();
			}
			res.json({ ok: true });
		});
	});

	app.post("/panes/:paneId/screenshot", (req, res) => {
		withPane(req, res, wakeTimeoutMs, (pane) => {
			browserManager
				.capturePng(pane.paneId, pane.workspaceId)
				.then((base64) => res.json({ base64 }))
				.catch((err) => res.status(404).json({ error: errorMessage(err) }));
		});
	});

	app.post("/panes/:paneId/eval", (req, res) => {
		const code = req.body?.code;
		if (typeof code !== "string") {
			res.status(400).json({ error: "code is required" });
			return;
		}
		withPane(req, res, wakeTimeoutMs, (pane) => {
			browserManager
				.evaluateJS(pane.paneId, code, pane.workspaceId)
				.then((result) => res.json({ result: result ?? null }))
				.catch((err) => res.status(500).json({ error: errorMessage(err) }));
		});
	});

	app.get("/panes/:paneId/console", (req, res) => {
		withPane(req, res, wakeTimeoutMs, (pane) => {
			res.json({
				entries: browserManager.getConsoleLogs(pane.paneId, pane.workspaceId),
			});
		});
	});

	app.post("/pane-layout", (req, res) => {
		const parsed = paneLayoutRequestSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: z.prettifyError(parsed.error) });
			return;
		}
		paneLayoutRequests
			.request(parsed.data.workspaceId, parsed.data.op)
			.then((result) => res.json(result))
			.catch((err) =>
				res
					.status(err instanceof PaneLayoutRequestError ? err.status : 500)
					.json({ error: errorMessage(err) }),
			);
	});

	app.post("/notify", (req, res) => {
		const parsed = desktopNotificationSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: z.prettifyError(parsed.error) });
			return;
		}
		res.json({ shown: showCliNotification(parsed.data) });
	});

	// Chromium browsers/profiles whose history and logins can be imported.
	app.get("/import-sources", (_req, res) => {
		listLoginImportSources(hasSafeStorageKey)
			.then((sources) => res.json({ sources }))
			.catch((err) => res.status(500).json({ error: errorMessage(err) }));
	});

	// Import logins (cookies) from a system browser into this pane's session.
	app.post("/panes/:paneId/import-cookies", (req, res) => {
		const sourceId = req.body?.sourceId;
		if (typeof sourceId !== "string" || sourceId.length === 0) {
			res.status(400).json({ error: "sourceId is required" });
			return;
		}
		const profile = resolveImportProfile(sourceId, homeDir);
		if (!profile) {
			res.status(404).json({ error: "Unknown import source" });
			return;
		}
		withPane(req, res, wakeTimeoutMs, (pane) => {
			confirmLoginImport(profile.browserName, profile.profileName)
				.then(async (allowed) => {
					if (!allowed) {
						res.status(403).json({ error: LOGIN_IMPORT_REFUSED });
						return;
					}
					res.json(
						await importCookiesIntoSession(
							pane.wc.session,
							profile.profileDir,
							profile.browserKey,
						),
					);
				})
				.catch((err) => res.status(500).json({ error: errorMessage(err) }));
		});
	});

	const extensionRoute = (
		{ requireInstalled }: { requireInstalled: boolean },
		handler: (
			extensions: UserExtensions,
			extensionId: string,
			req: Request,
			res: Response,
		) => Promise<void>,
	) => {
		return (req: Request, res: Response) => {
			if (!extensions) {
				res.status(503).json({ error: "Browser extensions are not available" });
				return;
			}
			const extensionId = req.body?.extensionId;
			if (typeof extensionId !== "string" || !EXTENSION_ID.test(extensionId)) {
				res
					.status(400)
					.json({ error: "extensionId must be a Chrome Web Store ID" });
				return;
			}
			if (
				requireInstalled &&
				!extensions.list().some((extension) => extension.id === extensionId)
			) {
				res
					.status(404)
					.json({ error: `No extension ${extensionId} is installed` });
				return;
			}
			handler(extensions, extensionId, req, res).catch((err) =>
				res.status(500).json({ error: errorMessage(err) }),
			);
		};
	};

	app.get("/extensions", (_req, res) => {
		if (!extensions) {
			res.status(503).json({ error: "Browser extensions are not available" });
			return;
		}
		res.json({ extensions: extensions.list() });
	});

	// The question closes when the caller hangs up or the deadline passes.
	const answerSignal = (res: Response): AbortSignal => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), answerDeadlineMs);
		res.on("close", () => {
			clearTimeout(timer);
			controller.abort();
		});
		return controller.signal;
	};
	const refuse = (res: Response, signal: AbortSignal, refusal: string) => {
		if (signal.aborted) res.status(408).json({ error: EXTENSION_UNANSWERED });
		else res.status(403).json({ error: refusal });
	};

	app.post(
		"/extensions/install",
		extensionRoute(
			{ requireInstalled: false },
			async (extensions, extensionId, _req, res) => {
				const signal = answerSignal(res);
				const result = await extensions.install(extensionId, signal);
				if (result.status === "declined") {
					refuse(res, signal, EXTENSION_INSTALL_REFUSED);
					return;
				}
				res.json(result);
			},
		),
	);

	app.post(
		"/extensions/remove",
		extensionRoute(
			{ requireInstalled: true },
			async (extensions, extensionId, _req, res) => {
				const signal = answerSignal(res);
				if (!(await extensions.remove(extensionId, signal))) {
					refuse(res, signal, EXTENSION_REMOVE_REFUSED);
					return;
				}
				res.json({ ok: true });
			},
		),
	);

	app.post(
		"/extensions/pin",
		extensionRoute(
			{ requireInstalled: true },
			async (extensions, extensionId, req, res) => {
				extensions.setPinned(extensionId, req.body?.pinned !== false);
				res.json({ ok: true });
			},
		),
	);

	const wss = new WebSocketServer({
		noServer: true,
		maxPayload: MAX_CDP_MESSAGE_BYTES,
	});

	const httpServer = await new Promise<Server>((resolve, reject) => {
		const s = app.listen(0, "127.0.0.1", () => resolve(s));
		s.on("error", reject);
	});

	httpServer.on("upgrade", (req, socket, head) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const match = CDP_PATH.exec(url.pathname);
		const workspaceId = url.searchParams.get("workspaceId");
		if (!match || !workspaceId || !isAuthorized(secret, req)) {
			socket.destroy();
			return;
		}
		const paneId = match[1] as string;
		wss.handleUpgrade(req, socket, head, (ws) => {
			handleCdpSocket(paneId, workspaceId, ws, wakeTimeoutMs);
		});
	});

	const address = httpServer.address();
	if (!address || typeof address === "string") {
		throw new Error("Browser bridge failed to bind a port");
	}
	server = httpServer;
	const endpoint = `http://127.0.0.1:${address.port}`;
	setBrowserBridgeInfo({ endpoint, secret });
	log.info(`[browser-bridge] listening on ${endpoint}`);
}

export async function stopBrowserBridge(): Promise<void> {
	const running = server;
	if (!running) return;
	server = null;
	running.closeAllConnections();
	await new Promise<void>((resolve) => running.close(() => resolve()));
}

function handleCdpSocket(
	paneId: string,
	workspaceId: string,
	ws: WebSocket,
	wakeTimeoutMs: number,
): void {
	// Messages that arrive while an unloaded pane is rebuilt go out once attached.
	const early: string[] = [];
	let earlyBytes = 0;
	const queue = (data: unknown) => {
		const message = String(data);
		earlyBytes += Buffer.byteLength(message, "utf8");
		if (
			early.length >= MAX_EARLY_CDP_FRAMES ||
			earlyBytes > MAX_CDP_MESSAGE_BYTES
		) {
			early.length = 0;
			ws.close(1009, "CDP frame backlog exceeded");
			return;
		}
		early.push(message);
	};
	ws.on("message", queue);
	void liveWebContents(paneId, workspaceId, wakeTimeoutMs).then(
		onPane,
		(err) => {
			const retry =
				err instanceof PaneLayoutRequestError &&
				(err.status === 503 || err.status === 504);
			ws.close(retry ? 1013 : 1011, errorMessage(err).slice(0, 100));
		},
	);
	function onPane(wc: Electron.WebContents | null) {
		if (ws.readyState !== ws.OPEN) return;
		if (!wc) {
			ws.close(
				1011,
				`No browser pane ${paneId} in this workspace`.slice(0, 100),
			);
			return;
		}
		browserManager.markUse(paneId);
		let cdp: ReturnType<typeof browserManager.attachCdp>;
		try {
			cdp = browserManager.attachCdp(
				paneId,
				workspaceId,
				(payload) => {
					if (ws.readyState === ws.OPEN) ws.send(payload);
				},
				(reason) => {
					ws.close(1011, `debugger detached: ${reason}`.slice(0, 100));
				},
			);
		} catch (err) {
			// 1013 (Try Again Later) tells the client the pane is busy with another
			// CDP session and to retry once it disconnects; 1011 = genuine failure.
			const code = err instanceof CdpBusyError ? 1013 : 1011;
			ws.close(code, errorMessage(err).slice(0, 100));
			return;
		}
		ws.off("message", queue);
		for (const message of early) cdp.send(message);
		ws.on("message", (data) => {
			cdp.send(data.toString());
		});
		ws.on("close", () => {
			cdp.detach();
		});
		ws.on("error", () => {
			cdp.detach();
		});
	}
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

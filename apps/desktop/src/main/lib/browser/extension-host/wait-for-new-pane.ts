import { browserManager } from "../browser-manager";

const NEW_PANE_TIMEOUT_MS = 10_000;

interface Waiter {
	workspaceId: string | null;
	paneSession: Electron.Session;
	known: Set<string>;
	resolve: (paneId: string) => void;
}

// Oldest first: each new pane goes to one waiter, so two quick opens in one
// workspace get a pane each.
const waiters: Waiter[] = [];

function onRegistered(event: {
	paneId: string;
	workspaceId: string | null;
}): void {
	const session = browserManager.getWebContents(event.paneId)?.session;
	const index = waiters.findIndex(
		(waiter) =>
			waiter.workspaceId === event.workspaceId &&
			!waiter.known.has(event.paneId) &&
			waiter.paneSession === session,
	);
	const [waiter] = index === -1 ? [] : waiters.splice(index, 1);
	if (waiters.length === 0) browserManager.off("pane-registered", onRegistered);
	waiter?.resolve(event.paneId);
}

export function waitForNewPane(
	workspaceId: string | null,
	paneSession: Electron.Session,
): Promise<string> {
	const known = new Set(browserManager.listPanes().map((pane) => pane.paneId));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			const index = waiters.indexOf(waiter);
			if (index !== -1) waiters.splice(index, 1);
			if (waiters.length === 0)
				browserManager.off("pane-registered", onRegistered);
			reject(new Error("No browser pane opened for the extension's tab"));
		}, NEW_PANE_TIMEOUT_MS);
		const waiter: Waiter = {
			workspaceId,
			paneSession,
			known,
			resolve: (paneId) => {
				clearTimeout(timer);
				resolve(paneId);
			},
		};
		if (waiters.length === 0)
			browserManager.on("pane-registered", onRegistered);
		waiters.push(waiter);
	});
}

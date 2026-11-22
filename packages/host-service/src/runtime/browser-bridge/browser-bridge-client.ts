import { TRPCError } from "@trpc/server";
import type { BrowserBridgeConfig } from "../../types";
import { bridgeErrorDetail, bridgeFetch } from "./bridge-fetch";
import type {
	BrowserExtension,
	BrowserExtensionInstall,
	BrowserPane,
	ConsoleEntry,
} from "./types";

export type {
	BrowserExtension,
	BrowserExtensionInstall,
	BrowserPane,
	ConsoleEntry,
} from "./types";

// A missing pane or a not-yet-open workspace is a caller-fixable precondition, not an internal fault.
const BRIDGE_ERROR_CODES: Partial<Record<number, TRPCError["code"]>> = {
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	408: "TIMEOUT",
	503: "PRECONDITION_FAILED",
	504: "NOT_FOUND",
};

/**
 * Thin HTTP client for the desktop's browser bridge. The bridge is the only
 * thing that can touch a browser pane's guest webContents; this proxies the
 * host-service `browser.*` procedures to it over loopback.
 */
export class BrowserBridgeClient {
	constructor(private readonly config: BrowserBridgeConfig) {}

	private async request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown,
	): Promise<T> {
		const res = await bridgeFetch(
			this.config,
			method,
			path,
			body,
			"Browser bridge",
		);
		if (!res.ok) {
			throw new TRPCError({
				code: BRIDGE_ERROR_CODES[res.status] ?? "BAD_REQUEST",
				message:
					bridgeErrorDetail(res.body) ?? `Browser bridge error (${res.status})`,
			});
		}
		return res.body as T;
	}

	listPanes(workspaceId: string) {
		return this.request<{ panes: BrowserPane[] }>(
			"GET",
			`/panes?workspaceId=${encodeURIComponent(workspaceId)}`,
		);
	}

	open(input: {
		workspaceId: string;
		projectId: string | null;
		url: string;
		target: "current-tab" | "new-tab";
		show?: boolean;
	}) {
		return this.request<{ paneId: string; url: string; title: string }>(
			"POST",
			"/open",
			input,
		);
	}

	navigate(workspaceId: string, paneId: string, url: string) {
		return this.request<{ ok: true }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/navigate`,
			{ workspaceId, url },
		);
	}

	reload(workspaceId: string, paneId: string, hard: boolean) {
		return this.request<{ ok: true }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/reload`,
			{ workspaceId, hard },
		);
	}

	screenshot(workspaceId: string, paneId: string) {
		return this.request<{ base64: string }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/screenshot`,
			{ workspaceId },
		);
	}

	evaluate(workspaceId: string, paneId: string, code: string) {
		return this.request<{ result: unknown }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/eval`,
			{ workspaceId, code },
		);
	}

	console(workspaceId: string, paneId: string) {
		return this.request<{ entries: ConsoleEntry[] }>(
			"GET",
			`/panes/${encodeURIComponent(paneId)}/console?workspaceId=${encodeURIComponent(workspaceId)}`,
		);
	}

	importSources() {
		return this.request<{
			sources: { id: string; browserName: string; profileName: string }[];
		}>("GET", "/import-sources");
	}

	importCookies(workspaceId: string, paneId: string, sourceId: string) {
		return this.request<{
			imported: number;
			skipped: number;
			keyUnavailable: boolean;
		}>("POST", `/panes/${encodeURIComponent(paneId)}/import-cookies`, {
			workspaceId,
			sourceId,
		});
	}

	listExtensions() {
		return this.request<{ extensions: BrowserExtension[] }>(
			"GET",
			"/extensions",
		);
	}

	installExtension(extensionId: string) {
		return this.request<BrowserExtensionInstall>(
			"POST",
			"/extensions/install",
			{
				extensionId,
			},
		);
	}

	removeExtension(extensionId: string) {
		return this.request<{ ok: true }>("POST", "/extensions/remove", {
			extensionId,
		});
	}

	setExtensionPinned(extensionId: string, pinned: boolean) {
		return this.request<{ ok: true }>("POST", "/extensions/pin", {
			extensionId,
			pinned,
		});
	}
}

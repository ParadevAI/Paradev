/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkManager.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager.ts
 *
 *  Manages link provider registration for a terminal instance.
 *  Handles lifecycle (dispose old providers before re-registering),
 *  resolver caching, and priority ordering.
 *--------------------------------------------------------------------------------------------*/

import type { ILinkHandler, Terminal as XTerm } from "@xterm/xterm";
import type { DetectedLink } from "./links";
import {
	LinkDetectorAdapter,
	LocalLinkDetector,
	type StatCallback,
	TerminalLinkResolver,
	WordLinkDetector,
} from "./links";
import { UrlLinkProvider } from "./links/url-link-provider";

export type LinkHoverInfo =
	| {
			kind: "file";
			isDirectory: boolean;
			resolvedPath?: string;
			row?: number;
			col?: number;
	  }
	| { kind: "url"; url: string };

/**
 * Link handler callbacks for the terminal.
 */
export interface TerminalLinkHandlers {
	/** Called when a file path link is activated (Cmd/Ctrl+click). */
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (event: MouseEvent, url: string) => void;
	/**
	 * Schemes besides http(s) that OSC 8 hyperlinks may activate, e.g.
	 * `superset:`. They get no hover info. Any other scheme stays inert.
	 */
	extraOscLinkProtocols?: readonly string[];
	/** Called when the mouse enters a detected link (file path or URL). */
	onLinkHover?: (event: MouseEvent, info: LinkHoverInfo) => void;
	/** Called when the mouse leaves a previously hovered link. */
	onLinkLeave?: () => void;
	/**
	 * Stat callback to validate file paths exist. Called via the host service
	 * which handles all path resolution (relative, tilde, etc.) server-side.
	 */
	stat?: StatCallback;
}

function fileUriPath(uri: string): string | null {
	try {
		const url = new URL(uri);
		return url.protocol === "file:" ? decodeURIComponent(url.pathname) : null;
	} catch {
		return null;
	}
}

function fileLink(
	uri: string,
	resolved: { path: string; isDirectory: boolean },
): DetectedLink {
	return {
		text: uri,
		startIndex: 0,
		endIndex: 0,
		resolvedPath: resolved.path,
		isDirectory: resolved.isDirectory,
		row: undefined,
		col: undefined,
		rowEnd: undefined,
		colEnd: undefined,
	};
}

interface LinkProviderDisposable {
	dispose(): void;
}

/**
 * Manages all link providers for a single terminal instance.
 *
 * Providers are registered in priority order (xterm uses first match):
 * 1. LocalLinkDetector (file paths with validation) + styled-text fallback
 * 2. UrlLinkProvider (wrapped URL detection)
 * 3. WordLinkDetector (bare filenames like "AGENTS.md")
 */
export class TerminalLinkManager {
	private _disposables: LinkProviderDisposable[] = [];
	private _resolver: TerminalLinkResolver | null = null;
	private _handlers: TerminalLinkHandlers | null = null;
	private _oscLinkHandler: ILinkHandler | null = null;
	private _hoverRequest = 0;

	constructor(private readonly _terminal: XTerm) {}

	/**
	 * Set link handlers and register providers. Safe to call multiple times —
	 * old providers are disposed before new ones are registered. The resolver
	 * is reused to preserve the stat cache.
	 */
	setHandlers(handlers: TerminalLinkHandlers): void {
		this._handlers = handlers;
		this._register();
	}

	/**
	 * Re-register providers (e.g. after terminal is created).
	 * No-op if handlers haven't been set yet.
	 */
	ensureRegistered(): void {
		if (this._handlers) {
			this._register();
		}
	}

	dispose(): void {
		this._hoverRequest++;
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._clearOscLinkHandler();
		this._resolver?.clearCache();
		this._resolver = null;
		this._handlers = null;
	}

	private _clearOscLinkHandler(): void {
		if (this._terminal.options.linkHandler === this._oscLinkHandler) {
			this._terminal.options.linkHandler = null;
		}
		this._oscLinkHandler = null;
	}

	private _register(): void {
		const handlers = this._handlers;
		if (!handlers?.stat) return;

		// Dispose old providers to prevent duplicates
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._clearOscLinkHandler();

		// Reuse resolver to preserve stat cache across re-registrations.
		if (!this._resolver) {
			this._resolver = new TerminalLinkResolver(handlers.stat);
		}

		const onLinkHover = handlers.onLinkHover;
		const onLinkLeave = handlers.onLinkLeave;

		// 1. File path detector (highest priority)
		const detector = new LocalLinkDetector(this._resolver);
		const adapter = new LinkDetectorAdapter(
			this._terminal,
			detector,
			handlers.onFileLinkClick,
			onLinkHover
				? (event, link) =>
						onLinkHover(event, {
							kind: "file",
							isDirectory: link.isDirectory,
							resolvedPath: link.resolvedPath,
							row: link.row,
							col: link.col,
						})
				: undefined,
			onLinkLeave,
		);
		this._disposables.push(this._terminal.registerLinkProvider(adapter));

		// 2. URL link provider (handles terminal-wrapped URLs)
		if (handlers.onUrlClick) {
			const onUrlClick = handlers.onUrlClick;
			const urlProvider = new UrlLinkProvider(
				this._terminal,
				(event, uri) => {
					onUrlClick(event, uri);
				},
				onLinkHover
					? (event, uri) => onLinkHover(event, { kind: "url", url: uri })
					: undefined,
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(urlProvider));

			// xterm always registers its own OSC 8 hyperlink provider first. Without
			// this, OSC 8 links use xterm's default confirm() + window.open() path,
			// which is blocked in Electron and also bypasses our link preferences.
			const extraProtocols = handlers.extraOscLinkProtocols ?? [];
			const hasProtocol = (uri: string, protocols: readonly string[]) => {
				try {
					return protocols.includes(new URL(uri).protocol);
				} catch {
					return false;
				}
			};
			const webProtocols = ["http:", "https:"];
			const activeProtocols = [...webProtocols, ...extraProtocols];
			const resolver = this._resolver;
			const onFileLinkClick = handlers.onFileLinkClick;
			this._hoverRequest++;
			// xterm drops non-http(s) OSC 8 links unless this is true, and then
			// hands every scheme to activate/hover, so those filter them again.
			// Its OSC provider also runs before ours, so a kept file: link must
			// do what the path detector under it did. Hover stays off for the
			// extra schemes: it feeds the URL hint and the "Open in" menu.
			this._oscLinkHandler = {
				allowNonHttpProtocols: extraProtocols.length > 0,
				activate: (event, uri) => {
					const path = fileUriPath(uri);
					if (path !== null) {
						if (!onFileLinkClick) return;
						void resolver.resolveLink(path).then((resolved) => {
							if (!resolved || !this._handlers) return;
							onFileLinkClick(event, fileLink(uri, resolved));
						});
						return;
					}
					if (hasProtocol(uri, activeProtocols)) onUrlClick(event, uri);
				},
				hover: onLinkHover
					? (event, uri) => {
							const request = ++this._hoverRequest;
							if (hasProtocol(uri, webProtocols)) {
								onLinkHover(event, { kind: "url", url: uri });
								return;
							}
							const path = fileUriPath(uri);
							if (path === null) return;
							void resolver.resolveLink(path).then((resolved) => {
								if (!resolved || request !== this._hoverRequest) return;
								onLinkHover(event, {
									kind: "file",
									isDirectory: resolved.isDirectory,
									resolvedPath: resolved.path,
								});
							});
						}
					: undefined,
				leave: () => {
					this._hoverRequest++;
					onLinkLeave?.();
				},
			};
			this._terminal.options.linkHandler = this._oscLinkHandler;
		}

		// 3. SUPERSET ADDITION: Word link detector (lowest priority).
		// Adapted from VSCode's TerminalWordLinkDetector. VSCode opens a
		// workspace search on click; ours opens the file directly if it
		// exists (validated via stat). Catches bare filenames like
		// "AGENTS.md" that have no path separator or line suffix.
		// To disable: remove or comment out this block.
		if (handlers.onFileLinkClick) {
			const onFileClick = handlers.onFileLinkClick;
			const wordDetector = new WordLinkDetector(
				this._terminal,
				this._resolver,
				(event, resolvedPath) => {
					onFileClick(event, {
						text: resolvedPath,
						startIndex: 0,
						endIndex: 0,
						resolvedPath,
						isDirectory: false,
						row: undefined,
						col: undefined,
						rowEnd: undefined,
						colEnd: undefined,
					});
				},
				onLinkHover
					? (event, resolvedPath) =>
							onLinkHover(event, {
								kind: "file",
								isDirectory: false,
								resolvedPath,
							})
					: undefined,
				onLinkLeave,
			);
			this._disposables.push(this._terminal.registerLinkProvider(wordDetector));
		}
	}
}

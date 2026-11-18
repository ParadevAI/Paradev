/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkManager.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkManager.ts
 *
 *  Manages link provider registration for a terminal instance.
 *  Handles lifecycle (dispose old providers before re-registering),
 *  resolver caching, and priority ordering.
 *--------------------------------------------------------------------------------------------*/

import type {
	IBufferRange,
	ILink,
	ILinkHandler,
	ILinkProvider,
	Terminal as XTerm,
} from "@xterm/xterm";
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
	 * Recognizes a non-http(s) OSC 8 link the app opens itself, e.g. a
	 * workspace link. It goes to `onUrlClick` with no hover info; any other
	 * non-http(s) OSC 8 link defers to the text link under it.
	 */
	isOscAppLink?: (uri: string) => boolean;
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

function fileUrlPath(uri: string): string | null {
	try {
		const url = new URL(uri);
		return url.protocol === "file:" ? decodeURIComponent(url.pathname) : null;
	} catch {
		return null;
	}
}

function comparePositions(
	a: IBufferRange["start"],
	b: IBufferRange["start"],
): number {
	return a.y - b.y || a.x - b.x;
}

function rangesOverlap(a: IBufferRange, b: IBufferRange): boolean {
	return (
		comparePositions(a.start, b.end) <= 0 &&
		comparePositions(b.start, a.end) <= 0
	);
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
	private _textProviders: ILinkProvider[] = [];

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

	private async _textLinkUnder(
		range: IBufferRange,
	): Promise<ILink | undefined> {
		for (const provider of this._textProviders) {
			const links = await new Promise<ILink[] | undefined>((resolve) =>
				provider.provideLinks(range.start.y, resolve),
			);
			const overlapping = (links ?? []).filter((candidate) =>
				rangesOverlap(candidate.range, range),
			);
			if (overlapping.length === 1) return overlapping[0];
			if (overlapping.length > 1) return undefined;
		}
		return undefined;
	}

	private _clearOscLinkHandler(): void {
		if (this._terminal.options.linkHandler === this._oscLinkHandler) {
			this._terminal.options.linkHandler = null;
		}
		this._oscLinkHandler = null;
	}

	private _register(): void {
		this._hoverRequest++;
		const handlers = this._handlers;
		if (!handlers?.stat) return;

		// Dispose old providers to prevent duplicates
		for (const d of this._disposables) d.dispose();
		this._disposables = [];
		this._textProviders = [];
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
		this._textProviders.push(adapter);

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
			this._textProviders.push(urlProvider);

			// xterm always registers its own OSC 8 hyperlink provider first. Without
			// this, OSC 8 links use xterm's default confirm() + window.open() path,
			// which is blocked in Electron and also bypasses our link preferences.
			const isOscAppLink = handlers.isOscAppLink;
			const hasProtocol = (uri: string, protocols: readonly string[]) => {
				try {
					return protocols.includes(new URL(uri).protocol);
				} catch {
					return false;
				}
			};
			const webProtocols = ["http:", "https:"];
			const opensAsUrl = (uri: string) =>
				hasProtocol(uri, webProtocols) || Boolean(isOscAppLink?.(uri));
			const resolver = this._resolver;
			const onFileLinkClick = handlers.onFileLinkClick;
			// xterm drops non-http(s) OSC 8 links unless this is true, and then
			// hands every scheme to activate/hover, so those filter them again.
			// Its OSC provider also runs before ours, so an OSC link we do not
			// open as a URL defers to the text link under it, then to its file:
			// target. App links get no hover: it feeds the URL hint and the
			// "Open in" menu.
			this._oscLinkHandler = {
				allowNonHttpProtocols: isOscAppLink !== undefined,
				activate: (event, uri, range) => {
					if (opensAsUrl(uri)) {
						onUrlClick(event, uri);
						return;
					}
					void this._textLinkUnder(range).then(async (textLink) => {
						if (!this._handlers) return;
						if (textLink) {
							textLink.activate(event, textLink.text);
							return;
						}
						const path = fileUrlPath(uri);
						if (!path || !onFileLinkClick) return;
						const resolved = await resolver.resolvePath(path);
						if (!resolved || !this._handlers) return;
						onFileLinkClick(event, fileLink(uri, resolved));
					});
				},
				hover: onLinkHover
					? (event, uri, range) => {
							const request = ++this._hoverRequest;
							if (hasProtocol(uri, webProtocols)) {
								onLinkHover(event, { kind: "url", url: uri });
								return;
							}
							if (isOscAppLink?.(uri)) return;
							const isCurrent = () => request === this._hoverRequest;
							void this._textLinkUnder(range).then(async (textLink) => {
								if (!isCurrent()) return;
								if (textLink) {
									textLink.hover?.(event, textLink.text);
									return;
								}
								const path = fileUrlPath(uri);
								if (!path) return;
								const resolved = await resolver.resolvePath(path);
								if (!resolved || !isCurrent()) return;
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
			this._textProviders.push(wordDetector);
		}
	}
}

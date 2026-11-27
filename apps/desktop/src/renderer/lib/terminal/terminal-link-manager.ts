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
	isWebLink,
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
	/**
	 * Finds the file a path most plausibly means when it does not exist as
	 * written. Asked only for path-like text, never for single words.
	 */
	resolveFile?: (reference: string) => Promise<{ resolvedPath: string } | null>;
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
	private _fileFinder: TerminalLinkResolver | null = null;
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
		this._fileFinder?.clearCache();
		this._fileFinder = null;
		this._handlers = null;
	}

	private async _textLinkUnder(
		range: IBufferRange,
	): Promise<ILink | undefined> {
		// Providers run in priority order; overlapping detections are one
		// visible link, separate ones make the OSC span ambiguous.
		const distinct: ILink[] = [];
		for (const provider of this._textProviders) {
			for (let y = range.start.y; y <= range.end.y; y++) {
				const links = await new Promise<ILink[] | undefined>((resolve) =>
					provider.provideLinks(y, resolve),
				);
				for (const link of links ?? []) {
					if (!rangesOverlap(link.range, range)) continue;
					const known = distinct.some((seen) =>
						rangesOverlap(seen.range, link.range),
					);
					if (!known) distinct.push(link);
				}
			}
		}
		return distinct.length === 1 ? distinct[0] : undefined;
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
		if (!this._fileFinder) {
			this._fileFinder = new TerminalLinkResolver(async (path) => {
				const file = await this._handlers?.resolveFile?.(path);
				return file
					? { isDirectory: false, resolvedPath: file.resolvedPath }
					: null;
			});
		}

		// xterm reports a text-selection drag that ends on a link as a click.
		const isClick = (event: MouseEvent) =>
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			!this._terminal.hasSelection();
		const onFileLinkClick =
			handlers.onFileLinkClick &&
			((event: MouseEvent, link: DetectedLink) => {
				if (isClick(event)) handlers.onFileLinkClick?.(event, link);
			});
		const onUrlClick =
			handlers.onUrlClick &&
			((event: MouseEvent, url: string) => {
				if (isClick(event)) handlers.onUrlClick?.(event, url);
			});

		const onLinkHover = handlers.onLinkHover;
		const onLinkLeave = handlers.onLinkLeave;

		// 1. File path detector (highest priority)
		const detector = new LocalLinkDetector(this._resolver, this._fileFinder);
		const adapter = new LinkDetectorAdapter(
			this._terminal,
			detector,
			(event, link) => {
				if (isWebLink(link)) onUrlClick?.(event, link.url);
				else onFileLinkClick?.(event, link);
			},
			onLinkHover
				? (event, link) =>
						onLinkHover(
							event,
							isWebLink(link)
								? { kind: "url", url: link.url }
								: {
										kind: "file",
										isDirectory: link.isDirectory,
										resolvedPath: link.resolvedPath,
										row: link.row,
										col: link.col,
									},
						)
				: undefined,
			onLinkLeave,
		);
		this._disposables.push(this._terminal.registerLinkProvider(adapter));
		this._textProviders.push(adapter);

		// 2. URL link provider (handles terminal-wrapped URLs)
		if (onUrlClick) {
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
			const isWebUri = (uri: string) => {
				try {
					return ["http:", "https:"].includes(new URL(uri).protocol);
				} catch {
					return false;
				}
			};
			// xterm drops non-http(s) OSC 8 links unless this is true, then hands
			// every scheme to activate/hover, and its OSC provider runs before
			// ours. So a link we do not open as a URL defers to the text link
			// under it, as it did when xterm dropped it. App links get no hover:
			// it feeds the URL hint and the "Open in" menu.
			this._oscLinkHandler = {
				allowNonHttpProtocols: isOscAppLink !== undefined,
				activate: (event, uri, range) => {
					if (isWebUri(uri) || isOscAppLink?.(uri)) {
						onUrlClick(event, uri);
						return;
					}
					void this._textLinkUnder(range).then((textLink) => {
						if (textLink && this._handlers) {
							textLink.activate(event, textLink.text);
						}
					});
				},
				hover: onLinkHover
					? (event, uri, range) => {
							const request = ++this._hoverRequest;
							if (isWebUri(uri)) {
								onLinkHover(event, { kind: "url", url: uri });
								return;
							}
							if (isOscAppLink?.(uri)) return;
							void this._textLinkUnder(range).then((textLink) => {
								if (textLink && request === this._hoverRequest) {
									textLink.hover?.(event, textLink.text);
								}
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
		if (onFileLinkClick) {
			const onFileClick = onFileLinkClick;
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

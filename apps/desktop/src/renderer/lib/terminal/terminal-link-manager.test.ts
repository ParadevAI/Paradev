import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import type { StatCallback } from "./links";
import { TerminalLinkManager } from "./terminal-link-manager";

const COLS = 80;
const APP_LINKS = new Set(["superset://v2-workspace/abc"]);
const isOscAppLink = (uri: string) => APP_LINKS.has(uri);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function bufferLine(text: string) {
	return {
		translateToString: (_trim?: boolean, start = 0, end = COLS) =>
			text.substring(start, end),
		isWrapped: false,
		length: COLS,
		getCell: (x: number) => ({
			getChars: () => text.padEnd(COLS)[x],
			getWidth: () => 1,
		}),
	};
}

function createMockTerminal({
	hasSelection = false,
	lines = [] as string[],
} = {}) {
	const bufferLines = lines.map(bufferLine);
	const registeredProviders: ILinkProvider[] = [];
	const disposedProviders: ILinkProvider[] = [];
	const terminal = {
		options: {
			linkHandler: null,
		},
		registerLinkProvider: (provider: ILinkProvider) => {
			registeredProviders.push(provider);
			return {
				dispose: () => {
					disposedProviders.push(provider);
				},
			};
		},
		buffer: {
			active: {
				length: bufferLines.length,
				viewportY: 0,
				getLine: (index: number) => bufferLines[index],
			},
		},
		cols: COLS,
		hasSelection: () => hasSelection,
	} as unknown as XTerm;

	return { terminal, registeredProviders, disposedProviders };
}

describe("TerminalLinkManager", () => {
	it("routes OSC 8 hyperlinks through the terminal URL handler", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		const onLinkHover = mock();
		const onLinkLeave = mock();

		manager.setHandlers({
			stat: async () => null,
			onUrlClick,
			onLinkHover,
			onLinkLeave,
		});

		const linkHandler = terminal.options.linkHandler;
		expect(linkHandler).toBeTruthy();
		expect(linkHandler?.allowNonHttpProtocols).toBe(false);

		const event = {} as MouseEvent;
		linkHandler?.activate(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.hover?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});
		linkHandler?.leave?.(event, "https://example.com", {
			start: { x: 1, y: 1 },
			end: { x: 20, y: 1 },
		});

		expect(onUrlClick).toHaveBeenCalledWith(event, "https://example.com");
		expect(onLinkHover).toHaveBeenCalledWith(event, {
			kind: "url",
			url: "https://example.com",
		});
		expect(onLinkLeave).toHaveBeenCalled();
	});

	it("ignores a plain click that ends a text selection", () => {
		const { terminal } = createMockTerminal({ hasSelection: true });
		const manager = new TerminalLinkManager(terminal);
		const onUrlClick = mock();
		manager.setHandlers({ stat: async () => null, onUrlClick });
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };

		terminal.options.linkHandler?.activate(
			{} as MouseEvent,
			"https://example.com",
			range,
		);
		expect(onUrlClick).not.toHaveBeenCalled();

		const modified = { metaKey: true } as MouseEvent;
		terminal.options.linkHandler?.activate(
			modified,
			"https://example.com",
			range,
		);
		expect(onUrlClick).toHaveBeenCalledWith(modified, "https://example.com");
	});

	describe("with an OSC 8 app link check", () => {
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };
		const event = {} as MouseEvent;
		let terminal: XTerm;
		let onUrlClick: ReturnType<typeof mock>;
		let onLinkHover: ReturnType<typeof mock>;

		beforeEach(() => {
			terminal = createMockTerminal().terminal;
			onUrlClick = mock();
			onLinkHover = mock();
			new TerminalLinkManager(terminal).setHandlers({
				stat: async () => null,
				onUrlClick,
				onLinkHover,
				isOscAppLink,
			});
		});

		it("lets xterm create non-http OSC 8 links", () => {
			expect(terminal.options.linkHandler?.allowNonHttpProtocols).toBe(true);
		});

		it.each([
			"superset://v2-workspace/abc",
			"https://example.com",
			"http://example.com",
		])("activates %s", (uri) => {
			terminal.options.linkHandler?.activate(event, uri, range);

			expect(onUrlClick).toHaveBeenCalledWith(event, uri);
		});

		it.each([
			"https://example.com",
			"http://example.com",
		])("reports hover on %s", (uri) => {
			terminal.options.linkHandler?.hover?.(event, uri, range);

			expect(onLinkHover).toHaveBeenCalledWith(event, {
				kind: "url",
				url: uri,
			});
		});

		it("reports no hover on an app link", () => {
			terminal.options.linkHandler?.hover?.(
				event,
				"superset://v2-workspace/abc",
				range,
			);

			expect(onLinkHover).not.toHaveBeenCalled();
		});

		it.each([
			"file:///etc/passwd",
			"javascript:alert(1)",
			"superset://tasks/abc",
			"not a url",
		])("never sends %s to the URL handler", async (uri) => {
			terminal.options.linkHandler?.activate(event, uri, range);
			terminal.options.linkHandler?.hover?.(event, uri, range);
			await flush();

			expect(onUrlClick).not.toHaveBeenCalled();
			expect(onLinkHover).not.toHaveBeenCalled();
		});
	});

	describe("with a non-app OSC 8 link over visible text", () => {
		const event = {} as MouseEvent;
		let onUrlClick: ReturnType<typeof mock>;
		let onFileLinkClick: ReturnType<typeof mock>;
		let onLinkHover: ReturnType<typeof mock>;
		let manager: TerminalLinkManager;

		function setUp(lines: string[], stat: StatCallback): XTerm {
			const { terminal } = createMockTerminal({ lines });
			onUrlClick = mock();
			onFileLinkClick = mock();
			onLinkHover = mock();
			manager = new TerminalLinkManager(terminal);
			manager.setHandlers({
				stat,
				onUrlClick,
				onFileLinkClick,
				onLinkHover,
				isOscAppLink,
			});
			return terminal;
		}

		const existingFile: StatCallback = async () => ({
			isDirectory: false,
			resolvedPath: "/Users/me/repo/src/index.ts",
		});
		const visiblePath = "/Users/me/repo/src/index.ts:12:3";
		const pathRange = { start: { x: 1, y: 1 }, end: { x: 32, y: 1 } };

		it.each([
			"cursor:///Users/me/repo/src/index.ts",
			"file:///Users/me/repo/src/index.ts",
			"superset://tasks/abc",
		])("opens the visible path with its position for %s", async (uri) => {
			const terminal = setUp([visiblePath], existingFile);
			terminal.options.linkHandler?.activate(event, uri, pathRange);
			await flush();

			expect(onUrlClick).not.toHaveBeenCalled();
			expect(onFileLinkClick).toHaveBeenCalledWith(
				event,
				expect.objectContaining({
					resolvedPath: "/Users/me/repo/src/index.ts",
					row: 12,
					col: 3,
				}),
			);
		});

		it("reports the visible path on hover", async () => {
			const terminal = setUp([visiblePath], existingFile);
			terminal.options.linkHandler?.hover?.(event, "cursor:///x", pathRange);
			await flush();

			expect(onLinkHover).toHaveBeenCalledWith(
				event,
				expect.objectContaining({ kind: "file", row: 12, col: 3 }),
			);
		});

		it("reports no hover once the pointer has left", async () => {
			const terminal = setUp([visiblePath], existingFile);
			terminal.options.linkHandler?.hover?.(event, "cursor:///x", pathRange);
			terminal.options.linkHandler?.leave?.(event, "cursor:///x", pathRange);
			await flush();

			expect(onLinkHover).not.toHaveBeenCalled();
		});

		it("reports no hover once the handlers are replaced without stat", async () => {
			const terminal = setUp([visiblePath], existingFile);
			terminal.options.linkHandler?.hover?.(event, "cursor:///x", pathRange);
			manager.setHandlers({});
			await flush();

			expect(onLinkHover).not.toHaveBeenCalled();
		});

		it("finds a visible link on a later row of the OSC range", async () => {
			const terminal = setUp(
				["see", "https://example.com/page"],
				async () => null,
			);
			terminal.options.linkHandler?.activate(event, "cursor:///x", {
				start: { x: 1, y: 1 },
				end: { x: 24, y: 2 },
			});
			await flush();

			expect(onUrlClick).toHaveBeenCalledWith(
				expect.anything(),
				"https://example.com/page",
			);
		});

		it("does nothing when two separate visible links overlap it", async () => {
			const terminal = setUp(
				["/tmp/a.ts:12:3 https://example.com"],
				async (path) => ({ isDirectory: false, resolvedPath: path }),
			);
			terminal.options.linkHandler?.activate(event, "cursor:///x", {
				start: { x: 1, y: 1 },
				end: { x: 34, y: 1 },
			});
			await flush();

			expect(onUrlClick).not.toHaveBeenCalled();
			expect(onFileLinkClick).not.toHaveBeenCalled();
		});
	});

	it("clears only the OSC link handler it installed", () => {
		const { terminal, disposedProviders } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const installedHandler = terminal.options.linkHandler;
		expect(installedHandler).toBeTruthy();

		manager.dispose();

		expect(terminal.options.linkHandler).toBeNull();
		expect(disposedProviders.length).toBe(2);
	});

	it("does not clear a link handler installed by another owner", () => {
		const { terminal } = createMockTerminal();
		const manager = new TerminalLinkManager(terminal);

		manager.setHandlers({
			stat: async () => null,
			onUrlClick: mock(),
		});

		const replacementHandler = {
			activate: mock(),
		};
		terminal.options.linkHandler = replacementHandler;

		manager.dispose();

		expect(terminal.options.linkHandler).toBe(replacementHandler);
	});
});

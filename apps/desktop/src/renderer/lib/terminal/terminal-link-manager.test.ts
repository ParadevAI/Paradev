import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

const COLS = 80;
const APP_LINKS = new Set(["superset://v2-workspace/abc"]);
const isOscAppLink = (uri: string) => APP_LINKS.has(uri);

function bufferLine(text: string) {
	return {
		translateToString: (_trim?: boolean, start = 0, end = COLS) =>
			text.substring(start, end),
		isWrapped: false,
		length: COLS,
		getCell: (x: number) => ({
			getChars: () => text[x] ?? " ",
			getWidth: () => 1,
		}),
	};
}

function createMockTerminal(lines: string[] = []) {
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
				getLine: (index: number) => bufferLines[index] ?? null,
			},
		},
		cols: COLS,
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
			"superset-dev://v2-workspace/abc",
			"not a url",
		])("ignores %s", (uri) => {
			terminal.options.linkHandler?.activate(event, uri, range);
			terminal.options.linkHandler?.hover?.(event, uri, range);

			expect(onUrlClick).not.toHaveBeenCalled();
			expect(onLinkHover).not.toHaveBeenCalled();
		});
	});

	describe("with a file: OSC 8 link", () => {
		const range = { start: { x: 1, y: 1 }, end: { x: 20, y: 1 } };
		const event = {} as MouseEvent;
		const uri = "file://host/Users/me/repo/src/index.ts";
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
		let terminal: XTerm;
		let manager: TerminalLinkManager;
		let stat: ReturnType<typeof mock>;
		let onUrlClick: ReturnType<typeof mock>;
		let onFileLinkClick: ReturnType<typeof mock>;
		let onLinkHover: ReturnType<typeof mock>;

		beforeEach(() => {
			terminal = createMockTerminal().terminal;
			stat = mock(async () => ({
				isDirectory: false,
				resolvedPath: "/Users/me/repo/src/index.ts",
			}));
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
		});

		it("opens it through the file link handler", async () => {
			terminal.options.linkHandler?.activate(event, uri, range);
			await flush();

			expect(stat).toHaveBeenCalledWith("/Users/me/repo/src/index.ts");
			expect(onUrlClick).not.toHaveBeenCalled();
			expect(onFileLinkClick).toHaveBeenCalledWith(
				event,
				expect.objectContaining({
					resolvedPath: "/Users/me/repo/src/index.ts",
					isDirectory: false,
				}),
			);
		});

		it("reports it as a file on hover", async () => {
			terminal.options.linkHandler?.hover?.(event, uri, range);
			await flush();

			expect(onLinkHover).toHaveBeenCalledWith(event, {
				kind: "file",
				isDirectory: false,
				resolvedPath: "/Users/me/repo/src/index.ts",
			});
		});

		it("reports no hover once the pointer has left", async () => {
			terminal.options.linkHandler?.hover?.(event, uri, range);
			terminal.options.linkHandler?.leave?.(event, uri, range);
			await flush();

			expect(onLinkHover).not.toHaveBeenCalled();
		});

		it.each([
			"FILE:///Users/me/repo/src/index.ts",
			"file:/Users/me/repo/src/index.ts",
			"file:///Users/me/repo/src/index%2Ets",
		])("passes the decoded path of %s to stat", async (variant) => {
			terminal.options.linkHandler?.activate(event, variant, range);
			await flush();

			expect(stat).toHaveBeenCalledWith("/Users/me/repo/src/index.ts");
		});

		it("keeps an encoded ? in the file name", async () => {
			terminal.options.linkHandler?.activate(
				event,
				"file:///tmp/report%3Fdraft.txt",
				range,
			);
			await flush();

			expect(stat).toHaveBeenCalledWith("/tmp/report?draft.txt");
		});

		it("keeps a line-like suffix in the file name", async () => {
			terminal.options.linkHandler?.activate(
				event,
				"file:///tmp/report:42",
				range,
			);
			await flush();

			expect(stat).toHaveBeenCalledWith("/tmp/report:42");
		});

		it("ignores a file URL whose path does not decode", async () => {
			terminal.options.linkHandler?.activate(
				event,
				"file:///tmp/report%ZZ.txt",
				range,
			);
			await flush();

			expect(stat).not.toHaveBeenCalled();
			expect(onFileLinkClick).not.toHaveBeenCalled();
		});

		it("drops a pending hover when the handlers are replaced without stat", async () => {
			terminal.options.linkHandler?.hover?.(event, uri, range);
			manager.setHandlers({});
			await flush();

			expect(onLinkHover).not.toHaveBeenCalled();
		});

		it("drops a pending hover when the handlers are replaced", async () => {
			terminal.options.linkHandler?.hover?.(event, uri, range);
			manager.setHandlers({ stat, onLinkHover: mock() });
			await flush();

			expect(onLinkHover).not.toHaveBeenCalled();
		});

		it("drops a click whose stat returns after dispose", async () => {
			terminal.options.linkHandler?.activate(event, uri, range);
			manager.dispose();
			await flush();

			expect(onFileLinkClick).not.toHaveBeenCalled();
		});

		it("reports only the latest hover of the same link", async () => {
			terminal.options.linkHandler?.hover?.(event, uri, range);
			terminal.options.linkHandler?.leave?.(event, uri, range);
			const latestEvent = { clientX: 5 } as MouseEvent;
			terminal.options.linkHandler?.hover?.(latestEvent, uri, range);
			await flush();

			expect(onLinkHover).toHaveBeenCalledTimes(1);
			expect(onLinkHover).toHaveBeenCalledWith(
				latestEvent,
				expect.objectContaining({ kind: "file" }),
			);
		});

		it("does nothing when the path does not exist", async () => {
			stat.mockImplementation(async () => null);
			terminal.options.linkHandler?.activate(event, uri, range);
			await flush();

			expect(onFileLinkClick).not.toHaveBeenCalled();
			expect(onUrlClick).not.toHaveBeenCalled();
		});
	});

	describe("with an OSC 8 link over a visible file path", () => {
		const event = {} as MouseEvent;
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
		const visiblePath = "/Users/me/repo/src/index.ts:12:3";
		const range = { start: { x: 1, y: 1 }, end: { x: 32, y: 1 } };
		let terminal: XTerm;
		let onUrlClick: ReturnType<typeof mock>;
		let onFileLinkClick: ReturnType<typeof mock>;

		beforeEach(() => {
			terminal = createMockTerminal([visiblePath]).terminal;
			onUrlClick = mock();
			onFileLinkClick = mock();
			new TerminalLinkManager(terminal).setHandlers({
				stat: async () => ({
					isDirectory: false,
					resolvedPath: "/Users/me/repo/src/index.ts",
				}),
				onUrlClick,
				onFileLinkClick,
				isOscAppLink,
			});
		});

		it.each([
			"cursor:///Users/me/repo/src/index.ts",
			"file:///Users/me/repo/src/index.ts",
			"superset://tasks/abc",
		])("opens the visible path with its position for %s", async (uri) => {
			terminal.options.linkHandler?.activate(event, uri, range);
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
	});

	describe("with an OSC 8 file link over two visible paths", () => {
		const event = {} as MouseEvent;
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
		const range = { start: { x: 1, y: 1 }, end: { x: 40, y: 1 } };
		let terminal: XTerm;
		let onFileLinkClick: ReturnType<typeof mock>;

		beforeEach(() => {
			terminal = createMockTerminal(["/tmp/a.ts:12:3 /tmp/b.ts:20:4"]).terminal;
			onFileLinkClick = mock();
			new TerminalLinkManager(terminal).setHandlers({
				stat: async (path) => ({ isDirectory: false, resolvedPath: path }),
				onUrlClick: mock(),
				onFileLinkClick,
				isOscAppLink,
			});
		});

		it("opens the link target instead of guessing a visible path", async () => {
			terminal.options.linkHandler?.activate(event, "file:///tmp/c.ts", range);
			await flush();

			expect(onFileLinkClick).toHaveBeenCalledTimes(1);
			expect(onFileLinkClick).toHaveBeenCalledWith(
				event,
				expect.objectContaining({ resolvedPath: "/tmp/c.ts" }),
			);
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

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

function createMockTerminal() {
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
				getLine: () => null,
			},
		},
		cols: 80,
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

	describe("with an extra OSC 8 protocol", () => {
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
				extraOscLinkProtocols: ["superset:"],
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
			new TerminalLinkManager(terminal).setHandlers({
				stat,
				onUrlClick,
				onFileLinkClick,
				onLinkHover,
				extraOscLinkProtocols: ["superset:"],
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

		it("does nothing when the path does not exist", async () => {
			stat.mockImplementation(async () => null);
			terminal.options.linkHandler?.activate(event, uri, range);
			await flush();

			expect(onFileLinkClick).not.toHaveBeenCalled();
			expect(onUrlClick).not.toHaveBeenCalled();
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

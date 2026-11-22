import { describe, expect, it, mock } from "bun:test";
import type { ILinkProvider, Terminal as XTerm } from "@xterm/xterm";
import { TerminalLinkManager } from "./terminal-link-manager";

function createMockTerminal({ hasSelection = false } = {}) {
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

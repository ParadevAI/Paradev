export type TerminalConnectionState =
	| "connecting"
	| "reconnecting"
	| "open"
	| "error"
	| "denied"
	| "ended";

export interface TerminalControlMessage {
	type: string;
	title?: string | null;
	message?: string;
	exitCode?: number;
	signal?: number;
}

export interface TerminalSelectState {
	active: boolean;
	hasSelection: boolean;
}

export interface TerminalWebViewHandle {
	/** Write raw bytes into the PTY (quick keys, native composers). */
	sendInput: (data: string) => void;
	/** Focus xterm's hidden textarea so the soft keyboard comes up. */
	focus: () => void;
	/** Reset the reconnect budget and redial (also the resume path). */
	retry: () => void;
	/** Copy the select-mode selection to the clipboard and leave select mode. */
	copySelection: () => void;
	/** Return the viewport to the live edge of the scrollback. */
	scrollToBottom: () => void;
}

export interface TerminalHost {
	organizationId: string;
	/** A machine id, or a cloud workspace's id when its sandbox is the host. */
	machineId: string;
}

export interface TerminalWebViewProps {
	workspaceId: string;
	terminalId: string;
	host: TerminalHost;
	onStateChange: (state: TerminalConnectionState) => void;
	onControl: (message: TerminalControlMessage) => void;
	/** Select mode entered/left, or the selection emptied — drives the
	 *  native Copy Selection row, which lives outside the WebView. */
	onSelectChange?: (select: TerminalSelectState) => void;
	/** Select-mode text landed on the clipboard (either copy path). */
	onCopied?: () => void;
	/** A plain tap on the terminal — not a link, not a long-press. The screen
	 *  uses it to dismiss the keyboard, since no overlay sits above the
	 *  WebView any more (an overlay would eat scroll drags). */
	onTap?: () => void;
	/** The viewport reached or left the bottom of the scrollback — drives the
	 *  scroll-to-bottom button, which lives outside the WebView. */
	onScrollChange?: (atBottom: boolean) => void;
	/** The terminal took or lost the keyboard itself. Only a terminal that
	 *  takes typing directly reports it; the others type through the composer. */
	onKeyboardFocusChange?: (focused: boolean) => void;
}

export type PageMessage =
	| { type: "ready" }
	| { type: "dial"; id: number; terminalId: string | null; seq: string }
	| {
			type: "snapshot";
			terminalId: string;
			data: string;
			epoch: string | null;
			seq: number;
	  }
	| { type: "state"; state: TerminalConnectionState }
	| { type: "control"; message: TerminalControlMessage }
	| { type: "openUrl"; url: string }
	| { type: "copy"; text: string }
	| { type: "select"; active: boolean; hasSelection: boolean }
	| { type: "tap" }
	| { type: "scroll"; atBottom: boolean };

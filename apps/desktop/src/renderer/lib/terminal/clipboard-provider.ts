import type { IClipboardProvider } from "@xterm/addon-clipboard";

/**
 * Clipboard provider for xterm's ClipboardAddon (OSC 52 copy/paste).
 *
 * OSC 52 arrives from the PTY whenever the program decides to copy, which is
 * routinely while the window is in the background. Chromium rejects clipboard
 * writes from an unfocused document, and the addon's default provider leaves
 * that rejection unhandled.
 *
 * Replayed output repeats reads and copies that already happened: a read's
 * answer would be dropped, and a copy would put stale text on the clipboard.
 */
export class FocusAwareClipboardProvider implements IClipboardProvider {
	constructor(private readonly isReplaying: () => boolean = () => false) {}

	readText(): string | Promise<string> {
		if (this.isReplaying()) return "";
		return navigator.clipboard.readText();
	}

	writeText(_selection: string, text: string): void | Promise<void> {
		if (this.isReplaying() || !document.hasFocus()) return;
		return this.write(text);
	}

	private async write(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			if (error instanceof DOMException && error.name === "NotAllowedError") {
				return;
			}
			throw error;
		}
	}
}

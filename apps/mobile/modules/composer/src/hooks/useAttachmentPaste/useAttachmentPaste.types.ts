import type { RefObject } from "react";
import type { TextInputInstance } from "react-native";
import type { ComposerPastedItem } from "../../Composer.types";

export interface AttachmentPasteOptions {
	input: RefObject<TextInputInstance | null>;
	/** The composer is expanded; the clipboard is read only then. */
	active: boolean;
	onPaste?: (items: ComposerPastedItem[]) => void;
}

export interface AttachmentPaste {
	/** Images or files are on the clipboard and a Paste control should show. */
	canPaste: boolean;
	paste: () => void;
}

export type UseAttachmentPaste = (
	options: AttachmentPasteOptions,
) => AttachmentPaste;

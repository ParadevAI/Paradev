import type { ComponentType } from "react";

export type AttachmentsSheetAction = "photos" | "camera" | "files";

export interface AttachmentsSheetAsset {
	uri: string;
	name: string;
	mediaType: string;
	size: number;
}

export interface AttachmentsSheetTheme {
	colorScheme: "light" | "dark";
	background: string;
	foreground: string;
	mutedForeground: string;
	border: string;
	secondary: string;
	secondaryForeground: string;
	primary: string;
	primaryForeground: string;
}

export interface AttachmentsSheetHandlers {
	onAddAssets: (assets: AttachmentsSheetAsset[]) => void;
	onAction: (action: AttachmentsSheetAction) => void;
	/** Dismissed with neither assets nor a row action. */
	onDismiss?: () => void;
}

/**
 * Presents the attachments sheet. Every presentation ends in exactly one
 * handler call — assets added, a row action, or a plain dismissal. Resolves
 * false when nothing was presented.
 */
export type PresentAttachmentsSheet = (
	theme: AttachmentsSheetTheme,
	handlers: AttachmentsSheetHandlers,
) => Promise<boolean>;

/** Mounted once at the app root; draws the sheet where no native module does. */
export type AttachmentsSheetHostComponent = ComponentType;

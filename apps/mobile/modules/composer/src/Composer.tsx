import { forwardRef, useImperativeHandle } from "react";
import type {
	ComposerComponent,
	ComposerHandle,
	ComposerProps,
	FileThumbnail,
	PresentImage,
} from "./Composer.types";

export const presentImage: PresentImage = async () => {};

export const fileThumbnail: FileThumbnail = async () => null;

export const Composer: ComposerComponent = forwardRef<
	ComposerHandle,
	ComposerProps
>(function Composer(_props, ref) {
	useImperativeHandle(ref, () => ({
		clear: () => {},
		appendDraft: () => {},
		focus: () => {},
		blur: () => {},
	}));
	return null;
});

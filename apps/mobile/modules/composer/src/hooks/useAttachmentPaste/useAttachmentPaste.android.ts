import { useEffect, useRef, useState } from "react";
import { ComposerAndroid } from "../../nativeComposerAndroid";
import type { UseAttachmentPaste } from "./useAttachmentPaste.types";

/** A text field takes only text, so images and files get their own Paste control. */
export const useAttachmentPaste: UseAttachmentPaste = ({ active, onPaste }) => {
	const [hasAttachments, setHasAttachments] = useState(false);
	const onPasteRef = useRef(onPaste);
	onPasteRef.current = onPaste;

	useEffect(() => {
		if (!active) return;
		setHasAttachments(ComposerAndroid.clipboardHasAttachments());
		const subscription = ComposerAndroid.addListener(
			"onClipboardChange",
			(event) => setHasAttachments(event.hasAttachments),
		);
		return () => subscription.remove();
	}, [active]);

	return {
		canPaste: hasAttachments && onPaste !== undefined,
		paste: () => {
			void ComposerAndroid.readClipboardAttachments()
				.then((items) => {
					if (items.length > 0) onPasteRef.current?.(items);
				})
				.catch(() => {});
		},
	};
};

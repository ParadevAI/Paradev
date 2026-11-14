import { useEffect, useRef } from "react";
import type { UseAttachmentPaste } from "./useAttachmentPaste.types";

/** The browser hands pasted files to the field itself; text pastes as usual. */
export const useAttachmentPaste: UseAttachmentPaste = ({ input, onPaste }) => {
	const onPasteRef = useRef(onPaste);
	onPasteRef.current = onPaste;

	useEffect(() => {
		const node = input.current as unknown as HTMLElement | null;
		if (!node?.addEventListener) return;
		const handle = (event: ClipboardEvent) => {
			const files = Array.from(event.clipboardData?.files ?? []);
			if (files.length === 0 || !onPasteRef.current) return;
			event.preventDefault();
			onPasteRef.current(
				files.map((file, index) => ({
					uri: URL.createObjectURL(file),
					name:
						file.name ||
						`pasted-${index + 1}.${file.type.split("/")[1] ?? "bin"}`,
					kind: file.type.startsWith("image/") ? "image" : "file",
				})),
			);
		};
		node.addEventListener("paste", handle);
		return () => node.removeEventListener("paste", handle);
	}, [input]);

	return { canPaste: false, paste: () => {} };
};

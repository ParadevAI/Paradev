import type { PromptInputAttachment } from "@superset/chat-ui/PromptInput";
import { type ReactNode, useCallback, useState } from "react";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";

type Preview = { src: string; filename: string };

export function useAttachmentPreview(): {
	onAttachmentClick: (attachment: PromptInputAttachment) => void;
	overlay: ReactNode;
} {
	const saveImageToDownloads = useSaveImageToDownloads();
	const [preview, setPreview] = useState<Preview | null>(null);
	const [open, setOpen] = useState(false);
	const onAttachmentClick = useCallback((attachment: PromptInputAttachment) => {
		if (!attachment.previewUrl || !attachment.file.type.startsWith("image/"))
			return;
		setPreview({
			src: attachment.previewUrl,
			filename: attachment.file.name || "image",
		});
		setOpen(true);
	}, []);
	const overlay = preview ? (
		<ImagePreviewOverlay
			filename={preview.filename}
			onClose={() => setOpen(false)}
			onDownload={() => saveImageToDownloads(preview.src, preview.filename)}
			open={open}
			src={preview.src}
		/>
	) : null;
	return { onAttachmentClick, overlay };
}

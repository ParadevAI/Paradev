import { useCallback, useEffect, useRef, useState } from "react";
import type { PromptInputAttachment } from "../../../PromptInput/types";

const previewable = (file: File) =>
	file.type.startsWith("image/") || file.type.startsWith("video/");

function revokePreview(attachments: PromptInputAttachment[], id: string) {
	const previewUrl = attachments.find(
		(attachment) => attachment.id === id,
	)?.previewUrl;
	if (previewUrl) URL.revokeObjectURL(previewUrl);
}

/** Files waiting to go out with the message, each image with a preview the hook owns and revokes. */
export function useMessageAttachments(enabled: boolean) {
	const [attachments, setAttachments] = useState<PromptInputAttachment[]>([]);
	const latest = useRef(attachments);
	latest.current = attachments;

	useEffect(
		() => () => {
			for (const attachment of latest.current) {
				if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
			}
		},
		[],
	);

	const add = useCallback(
		(files: FileList | File[]) => {
			const incoming = Array.from(files);
			if (!enabled || incoming.length === 0) return;
			const added = incoming.map((file) => ({
				id: crypto.randomUUID(),
				file,
				previewUrl: previewable(file) ? URL.createObjectURL(file) : undefined,
			}));
			setAttachments((previous) => [...previous, ...added]);
		},
		[enabled],
	);

	const remove = useCallback((id: string) => {
		revokePreview(latest.current, id);
		setAttachments((previous) =>
			previous.filter((attachment) => attachment.id !== id),
		);
	}, []);

	const dropPreview = useCallback((id: string) => {
		revokePreview(latest.current, id);
		setAttachments((previous) =>
			previous.map((attachment) =>
				attachment.id === id
					? { ...attachment, previewUrl: undefined }
					: attachment,
			),
		);
	}, []);

	const clear = useCallback(() => {
		for (const attachment of latest.current) {
			if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
		}
		setAttachments([]);
	}, []);

	return { attachments, add, remove, dropPreview, clear };
}

import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useSendAttachments } from "../../../../../../hooks/useSendAttachments";
import {
	AttachmentLimitError,
	AttachmentSourceError,
} from "../../../../../../utils/sendAttachmentsToWorkspace";
import { formatAttachmentTag } from "../../../../utils/attachmentTags";

export type UploadAttachmentsResult =
	| { ok: true; tags: string[] }
	| { ok: false; keep: File[] };

export function useUploadAttachments(workspaceId: string) {
	const { t } = useLingui();
	const sendAttachments = useSendAttachments(workspaceId);

	return useCallback(
		async (files: File[]): Promise<UploadAttachmentsResult> => {
			if (files.length === 0) return { ok: true, tags: [] };
			const describe = (error: unknown): string => {
				if (error instanceof AttachmentLimitError) return error.message;
				if (error instanceof AttachmentSourceError) {
					const name = error.fileName;
					switch (error.problem) {
						case "missing":
							return t({
								message: `"${name}" was moved or deleted. Attach it again.`,
							});
						case "not-a-file":
							return t({
								message: `"${name}" is a folder. Attach the files inside it instead.`,
							});
						case "unreadable":
							return t({
								message: `Paradev doesn't have permission to read "${name}".`,
							});
					}
				}
				return errorMessage(error, t({ message: "Unknown error" }));
			};
			try {
				const paths = await sendAttachments(files);
				return {
					ok: true,
					tags: paths.map((path, index) =>
						formatAttachmentTag({
							path,
							type: files[index]?.type ?? "",
							name: files[index]?.name,
						}),
					),
				};
			} catch (error) {
				toast.error(t({ message: "Couldn't attach files" }), {
					description: describe(error),
				});
				return {
					ok: false,
					keep:
						error instanceof AttachmentSourceError
							? files.filter((_, index) => index !== error.index)
							: files,
				};
			}
		},
		[sendAttachments, t],
	);
}

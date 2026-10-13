import { MAX_CHAT_IMAGE_BYTES } from "@superset/shared/attachment-limits";
import { Badge } from "@superset/ui/badge";
import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { LargeImageTile } from "./components/LargeImageTile";
import { PreviewableImage } from "./components/PreviewableImage";

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function AttachmentImage({
	alt,
	path,
	type,
}: {
	path: string;
	type: string;
	alt?: string | undefined;
}) {
	const { workspaceId } = useChatPaneActions();
	const saveImageToDownloads = useSaveImageToDownloads();
	const name = path.split("/").pop() ?? path;
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: Boolean(workspaceId) },
	);
	const worktreePath = workspace?.worktreePath;
	const absolutePath = `${worktreePath}/${path}`;
	const readOptions = {
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	} as const;
	const thumbnail = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath,
			maxBytes: MAX_THUMBNAIL_BYTES,
		},
		{ ...readOptions, enabled: Boolean(workspaceId && worktreePath) },
	);
	const [unrenderable, setUnrenderable] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const tooLargeForThumbnail =
		thumbnail.data?.kind === "bytes" && thumbnail.data.exceededLimit;
	const preview = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath,
			maxBytes: MAX_CHAT_IMAGE_BYTES,
		},
		{
			...readOptions,
			enabled: Boolean(
				workspaceId && worktreePath && tooLargeForThumbnail && previewOpen,
			),
		},
	);

	if (
		!workspaceId ||
		thumbnail.isError ||
		preview.isError ||
		unrenderable ||
		(thumbnail.data && thumbnail.data.kind !== "bytes") ||
		(preview.data &&
			(preview.data.kind !== "bytes" || preview.data.exceededLimit))
	)
		return <Badge variant="secondary">{name}</Badge>;
	if (thumbnail.isPending || !thumbnail.data)
		return (
			<div className="size-40 animate-pulse rounded-2xl bg-foreground/10" />
		);
	if (tooLargeForThumbnail) {
		const src =
			preview.data?.kind === "bytes"
				? `data:${type};base64,${preview.data.content}`
				: null;
		return (
			<>
				<LargeImageTile
					filename={name}
					loading={previewOpen && preview.isFetching}
					onClick={() => setPreviewOpen(true)}
				/>
				{src && (
					<ImagePreviewOverlay
						filename={name}
						onClose={() => setPreviewOpen(false)}
						onDownload={() => saveImageToDownloads(src, name)}
						open={previewOpen}
						src={src}
					/>
				)}
			</>
		);
	}
	const src = `data:${type};base64,${thumbnail.data.content}`;
	return (
		<PreviewableImage
			alt={alt}
			filename={name}
			onDownload={() => saveImageToDownloads(src, name)}
			onError={() => setUnrenderable(true)}
			src={src}
		/>
	);
}

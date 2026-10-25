import { MAX_CHAT_IMAGE_BYTES } from "@superset/shared/attachment-limits";
import { workspaceTrpc } from "@superset/workspace-client";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";

export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

const READ_OPTIONS = {
	staleTime: Number.POSITIVE_INFINITY,
	retry: false,
} as const;

export type ChatImageSource =
	| { status: "loading" }
	| { status: "error" }
	| { status: "too-large" }
	| { status: "ready"; src: string };

/**
 * The bytes behind a transcript image as a data URL. The thumbnail read is
 * capped; `full` follows it with the larger read for a file over the cap, so
 * a thumbnail and the overlay showing the same file share one cached read.
 */
export function useChatImageSource(
	image: { path: string; mimeType: string } | null,
	{ full }: { full: boolean },
): ChatImageSource {
	const { workspaceId } = useChatPaneActions();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: Boolean(workspaceId) },
	);
	const worktreePath = workspaceQuery.data?.worktreePath;
	const absolutePath = `${worktreePath}/${image?.path}`;
	const located = Boolean(workspaceId && worktreePath && image);
	const thumbnail = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath,
			maxBytes: MAX_THUMBNAIL_BYTES,
		},
		{ ...READ_OPTIONS, enabled: located },
	);
	const tooLargeForThumbnail =
		thumbnail.data?.kind === "bytes" && thumbnail.data.exceededLimit;
	const preview = workspaceTrpc.filesystem.readFile.useQuery(
		{
			workspaceId: workspaceId ?? "",
			absolutePath,
			maxBytes: MAX_CHAT_IMAGE_BYTES,
		},
		{ ...READ_OPTIONS, enabled: located && tooLargeForThumbnail && full },
	);

	if (!workspaceId || !image) return { status: "error" };
	if (workspaceQuery.isError) return { status: "error" };
	if (workspaceQuery.isSuccess && !worktreePath) return { status: "error" };
	if (thumbnail.isError) return { status: "error" };
	if (thumbnail.isPending || !thumbnail.data) return { status: "loading" };
	if (thumbnail.data.kind !== "bytes") return { status: "error" };
	if (!tooLargeForThumbnail)
		return {
			status: "ready",
			src: `data:${image.mimeType};base64,${thumbnail.data.content}`,
		};
	if (!full) return { status: "too-large" };
	if (preview.isError) return { status: "error" };
	if (preview.isPending || !preview.data) return { status: "loading" };
	if (preview.data.kind !== "bytes" || preview.data.exceededLimit)
		return { status: "error" };
	return {
		status: "ready",
		src: `data:${image.mimeType};base64,${preview.data.content}`,
	};
}

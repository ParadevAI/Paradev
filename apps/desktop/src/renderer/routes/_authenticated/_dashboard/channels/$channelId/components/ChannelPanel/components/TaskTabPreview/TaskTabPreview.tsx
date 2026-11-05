import { LuSquareCheck } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { TabPreviewContent } from "../TabPreviewContent";

const PREVIEW_STALE_MS = 30_000;
const DESCRIPTION_PREVIEW_LENGTH = 400;

interface TaskTabPreviewProps {
	taskId: string;
	label: string;
}

export function TaskTabPreview({ taskId, label }: TaskTabPreviewProps) {
	const { data: task } = cloudTrpc.task.byIdOrSlug.useQuery(taskId, {
		staleTime: PREVIEW_STALE_MS,
		retry: false,
	});
	const { data: statuses } = cloudTrpc.task.statuses.list.useQuery(undefined, {
		staleTime: PREVIEW_STALE_MS,
	});
	const status = statuses?.find((entry) => entry.id === task?.statusId);
	const description = task?.description
		?.replace(/\s+/g, " ")
		.trim()
		.slice(0, DESCRIPTION_PREVIEW_LENGTH);
	return (
		<TabPreviewContent
			title={task?.title ?? label}
			icon={<LuSquareCheck />}
			subtitle={[task?.slug ?? label, status?.name].filter(Boolean).join(" · ")}
			body={
				description ? (
					<div className="relative h-40 overflow-hidden rounded-lg bg-muted/60 p-3">
						<p className="text-xs leading-5 text-foreground/90">
							{description}
						</p>
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-popover/80 to-transparent" />
					</div>
				) : undefined
			}
		/>
	);
}

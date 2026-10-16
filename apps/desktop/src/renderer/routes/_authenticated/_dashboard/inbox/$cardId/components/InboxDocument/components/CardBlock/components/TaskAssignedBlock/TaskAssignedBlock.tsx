import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import { CloudTaskRow } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";
import { RunInWorkspacePopoverV2 } from "renderer/routes/_authenticated/_dashboard/tasks/components/RunInWorkspacePopoverV2";
import { PriorityIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/PriorityIcon";
import { useActionKey } from "../../providers/ActionKeysProvider";
import type { CardBlockViewProps } from "../../types";
import { ActionKeycap } from "../ActionKeycap";
import { SupersetWorkspace } from "../SupersetWorkspace";

/** A task someone gave the reader, drawn with the task list's own row and icons, with the workspaces already on it. */
export function TaskAssignedBlock({
	view,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"superset.task_assigned">) {
	const navigate = useNavigate();
	const startKey = useActionKey("started");
	const task = view.task;
	const openTask = () =>
		void navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-2.5 px-2 py-2">
				<CloudTaskRow
					task={{
						id: task.id,
						slug: task.slug,
						externalProvider: null,
						externalKey: null,
						title: task.title,
						status: {
							type: task.status.type,
							color: task.status.color,
							progressPercent: null,
						},
					}}
					onOpen={openTask}
				/>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 text-[12.5px] text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<PriorityIcon
							priority={task.priority as "none"}
							statusType={task.status.type}
						/>
						<span className="capitalize">{task.priority}</span>
					</span>
					<span>{task.status.name}</span>
					{task.assignee && (
						<span className="flex items-center gap-1.5">
							<Avatar className="size-4">
								{task.assignee.image && (
									<AvatarImage
										src={task.assignee.image}
										alt={task.assignee.name}
									/>
								)}
								<AvatarFallback className="text-[8px]">
									{task.assignee.name.slice(0, 1)}
								</AvatarFallback>
							</Avatar>
							{task.assignee.name}
						</span>
					)}
					{task.dueDate && (
						<span>
							{formatDate(new Date(task.dueDate), { dateStyle: "medium" })}
						</span>
					)}
					{task.labels.map((label) => (
						<span
							key={label.name}
							className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]"
						>
							<span
								className="size-1.5 rounded-full"
								style={{ backgroundColor: label.color ?? "currentColor" }}
							/>
							{label.name}
						</span>
					))}
				</div>
				{task.description && (
					<div className="line-clamp-6 px-2 text-[13px] text-foreground">
						<CommentMarkdown body={task.description} />
					</div>
				)}
			</div>
			{view.workspaces.length > 0 && (
				<div className="border-t border-border">
					{view.workspaces.map((workspace) => (
						<SupersetWorkspace key={workspace.id} workspace={workspace} />
					))}
				</div>
			)}
			{!done && (
				<div className="flex flex-col gap-2 border-t border-border px-4 py-3">
					{failure && <p className="text-xs text-destructive">{failure}</p>}
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant="ghost" onClick={openTask}>
							<Trans>Open task</Trans>
						</Button>
						<div className="ml-auto">
							<RunInWorkspacePopoverV2
								tasks={[
									{
										id: task.id,
										slug: task.slug,
										title: task.title,
										description: task.description,
										branch: task.branch,
									},
								]}
								align="end"
								onComplete={() => onAct("started")}
								trigger={
									<Button
										type="button"
										size="sm"
										disabled={pending}
										data-action-key={startKey}
									>
										<Trans>Start with an agent</Trans>
										<ActionKeycap slot={startKey} />
									</Button>
								}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuLoader, LuPlus } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CreateTaskDialog } from "renderer/routes/_authenticated/_dashboard/components/CreateTaskDialog";
import { NewProjectDialog } from "renderer/routes/_authenticated/_dashboard/components/NewProjectDialog";
import { ProjectPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectPicker";
import { ProjectTaskList } from "renderer/routes/_authenticated/_dashboard/components/ProjectTaskList";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { LinearIssuesContent } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/LinearIssuesContent";
import { useLinearConnection } from "renderer/routes/_authenticated/_dashboard/tasks/hooks/useLinearWorkspace";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";
import { TaskPane } from "../TaskPane";

interface ChannelTasksTabProps {
	channelId: string;
	/** Members of a live channel can change its project and add tasks. */
	canAdd: boolean;
}

/** The tasks of the channel's project, or the issues of its Linear project. */
export function ChannelTasksTab({ channelId, canAdd }: ChannelTasksTabProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const { people, currentUserId } = useOrganizationPeople();
	const inviteMember = useInviteMember();
	const [openTaskId, setOpenTaskId] = useState<string | null>(null);
	const [isCreating, setCreating] = useState(false);
	const [newProjectName, setNewProjectName] = useState<string | null>(null);
	const { data: tasks, isPending } = cloudTrpc.channelTask.list.useQuery({
		channelId,
	});
	const { data: project } = cloudTrpc.channelTask.project.useQuery({
		channelId,
	});
	const { data: projects } = cloudTrpc.taskProject.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null && canAdd },
	);
	const navigate = useNavigate();
	const linearConnection = useLinearConnection();
	const hasLinear =
		!!linearConnection.data && !linearConnection.data.needsReconnect;
	const { data: linearLink } = cloudTrpc.channelTask.linearProject.useQuery({
		channelId,
	});
	const linearProjectId = linearLink?.linearProjectId ?? null;
	const { data: linearProjects } =
		cloudTrpc.integration.linear.projects.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: organizationId !== null && hasLinear, retry: false },
		);
	const linearProject = linearProjectId
		? (linearProjects?.find((option) => option.id === linearProjectId) ?? {
				id: linearProjectId,
				name: t({ message: "Linear project" }),
			})
		: null;
	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const refreshChannel = () => {
		void utils.channelTask.list.invalidate({ channelId });
		void utils.channelTask.project.invalidate({ channelId });
		void utils.channelTask.linearProject.invalidate({ channelId });
	};
	const addTask = cloudTrpc.channelTask.add.useMutation({
		onSettled: refreshChannel,
		onError,
	});
	const setProject = cloudTrpc.channelTask.setProject.useMutation({
		onSettled: refreshChannel,
		onError,
	});
	const setLinearProject = cloudTrpc.channelTask.setLinearProject.useMutation({
		onSettled: refreshChannel,
		onError,
	});
	const createProject = cloudTrpc.taskProject.create.useMutation({
		onSuccess: (created) => {
			void utils.taskProject.list.invalidate();
			setNewProjectName(null);
			if (created) setProject.mutate({ channelId, projectId: created.id });
		},
		onError,
	});

	if (openTaskId) {
		return <TaskPane taskId={openTaskId} onClose={() => setOpenTaskId(null)} />;
	}
	const picker = canAdd && (
		<ProjectPicker
			project={project ?? null}
			projects={projects ?? []}
			onSetProject={(projectId) =>
				projectId === null && linearProjectId
					? setLinearProject.mutate({ channelId, linearProjectId: null })
					: setProject.mutate({ channelId, projectId })
			}
			onCreateProject={setNewProjectName}
			linearProject={linearProject}
			linearProjects={linearProjects}
			onSetLinearProject={
				hasLinear
					? (id) => setLinearProject.mutate({ channelId, linearProjectId: id })
					: undefined
			}
		/>
	);
	if (linearProjectId) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{picker && <div className="px-4 pt-4 pb-2 text-sm">{picker}</div>}
				<LinearIssuesContent
					filters={{
						teamId: null,
						projectId: linearProjectId,
						status: "all",
						assignee: null,
						search: "",
					}}
					viewMode="table"
					onOpen={(issue) =>
						navigate({
							to: "/tasks/linear/$issueId",
							params: { issueId: issue.identifier },
						})
					}
				/>
			</div>
		);
	}
	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			{canAdd && (
				<div className="flex items-center justify-between gap-2 pb-2 text-sm">
					{picker}
					<button
						type="button"
						onClick={() => setCreating(true)}
						className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuPlus className="size-3.5" />
						<Trans>Add task</Trans>
					</button>
					<CreateTaskDialog
						open={isCreating}
						onOpenChange={setCreating}
						onCreated={(task) => addTask.mutate({ channelId, taskId: task.id })}
					/>
					<NewProjectDialog
						open={newProjectName !== null}
						initialName={newProjectName ?? ""}
						people={people}
						onInvite={inviteMember}
						defaultLeadId={currentUserId}
						isCreating={createProject.isPending}
						onOpenChange={(open) => {
							if (!open) setNewProjectName(null);
						}}
						onCreate={(created) => {
							if (organizationId) {
								createProject.mutate({ organizationId, ...created });
							}
						}}
					/>
				</div>
			)}
			{isPending ? (
				<div className="flex justify-center py-10 text-muted-foreground">
					<LuLoader className="size-4 animate-spin" />
				</div>
			) : !tasks?.length ? (
				<p className="px-2 pt-2 text-sm text-muted-foreground">
					<Trans>No tasks in this channel yet.</Trans>
				</p>
			) : (
				<ProjectTaskList tasks={tasks} onOpenTask={setOpenTaskId} />
			)}
		</div>
	);
}

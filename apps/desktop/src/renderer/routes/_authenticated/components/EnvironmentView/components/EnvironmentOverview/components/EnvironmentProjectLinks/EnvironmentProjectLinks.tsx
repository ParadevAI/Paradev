import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { LuLink } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { cloudRepoProjectId } from "renderer/lib/github/cloudRepoProjectId";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

function projectIconUrl(project: {
	icon: string | null;
	repoOwner: string | null;
}): string | null {
	if (project.icon) return project.icon;
	return project.repoOwner
		? `https://github.com/${project.repoOwner}.png?size=64`
		: null;
}

interface EnvironmentProjectLinksProps {
	environmentId: string;
	projectIds: readonly string[];
	/** A cloud project stands in for a repository; its key names it. */
	repositories: ReadonlyArray<{ fullName: string; name: string }>;
	id?: string;
}

export function EnvironmentProjectLinks({
	environmentId,
	projectIds,
	repositories,
	id,
}: EnvironmentProjectLinksProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { projects } = useHostProjects();
	const [open, setOpen] = useState(false);
	const onSettled = {
		onSuccess: async () => {
			await utils.environment.invalidate();
		},
		onError: (error: unknown) => toast.error(errorMessage(error)),
	};
	const link = cloudTrpc.environment.linkProject.useMutation(onSettled);
	const unlink = cloudTrpc.environment.unlinkProject.useMutation(onSettled);

	const linked = projectIds.map((projectId) => {
		const project = projects.find(
			(candidate) => candidate.projectKey === projectId,
		);
		const repository = repositories.find(
			(candidate) => cloudRepoProjectId(candidate.fullName) === projectId,
		);
		return { projectId, project, name: project?.name ?? repository?.name };
	});
	const linkable = projects.filter(
		(project) => !projectIds.includes(project.projectKey),
	);

	return (
		<div
			className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-2 py-2"
			id={id}
		>
			{linked.map(({ projectId, project, name }) => (
				<span
					className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-muted/60 pr-1 pl-2 text-xs"
					key={projectId}
				>
					{project && (
						<ProjectThumbnail
							className="size-3.5"
							projectName={project.name}
							iconUrl={projectIconUrl(project)}
							color={project.color}
						/>
					)}
					<span className="truncate">
						{name ?? t({ message: "Project on another device" })}
					</span>
					<button
						aria-label={t({ message: "Unlink project" })}
						className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
						disabled={unlink.isPending}
						onClick={() => unlink.mutate({ environmentId, projectId })}
						type="button"
					>
						<HiMiniXMark className="size-3" />
					</button>
				</span>
			))}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
						type="button"
					>
						<LuLink className="size-3" />
						<Trans>Link</Trans>
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-64 p-0" side="bottom">
					<Command>
						<CommandInput
							className="text-xs"
							placeholder={t({ message: "Search projects..." })}
						/>
						<CommandList className="max-h-56">
							<CommandEmpty className="px-3 py-3 text-center text-xs text-muted-foreground">
								<Trans>No projects to link.</Trans>
							</CommandEmpty>
							<CommandGroup>
								{linkable.map((project) => (
									<CommandItem
										className="rounded-md text-xs"
										key={project.projectKey}
										onSelect={() => {
											setOpen(false);
											link.mutate({
												environmentId,
												projectId: project.projectKey,
											});
										}}
										value={`${project.name} ${project.projectKey}`}
									>
										<ProjectThumbnail
											className="size-4"
											projectName={project.name}
											iconUrl={projectIconUrl(project)}
											color={project.color}
										/>
										<span className="flex-1 truncate">{project.name}</span>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

import { Trans } from "@lingui/react/macro";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { useNavigate } from "@tanstack/react-router";
import { LuContainer, LuRefreshCw, LuSettings } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { MOVE_MENU_PRIMITIVES, type MoveMenuKind } from "../../constants";

interface MoveToCloudItemsProps {
	menu: MoveMenuKind;
	projectId: string | null;
	onSelectEnvironment: (environment: {
		id: string;
		repositoryFullName: string | null;
	}) => void;
}

/** Only environments that open the workspace's repository: a move refuses any other. */
export function MoveToCloudItems({
	menu,
	projectId,
	onSelectEnvironment,
}: MoveToCloudItemsProps) {
	const { Item, Separator, iconClassName } = MOVE_MENU_PRIMITIVES[menu];
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const { projects } = useHostProjects();
	const project = projects.find(
		(row) => row.projectKey === projectId || row.id === projectId,
	);
	const repository =
		project?.repoOwner && project.repoName
			? `${project.repoOwner}/${project.repoName}`.toLowerCase()
			: null;
	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId && repository !== null },
	);
	const environments = startableCloudEnvironments(
		environmentsQuery.data ?? [],
	).filter(
		(environment) =>
			environment.repositories?.[0]?.fullName.toLowerCase() === repository,
	);

	return (
		<>
			{repository !== null && environmentsQuery.isLoading ? (
				<Item disabled>
					<Trans>Loading…</Trans>
				</Item>
			) : environmentsQuery.isError ? (
				<Item
					onSelect={(event) => {
						event.preventDefault();
						void environmentsQuery.refetch();
					}}
				>
					<LuRefreshCw className={iconClassName} />
					<Trans>Couldn’t load environments. Try again</Trans>
				</Item>
			) : environments.length === 0 ? (
				<Item disabled>
					<Trans>No environments linked to this project.</Trans>
				</Item>
			) : null}
			{environments.map((environment) => (
				<Item
					key={environment.id}
					onSelect={() =>
						onSelectEnvironment({
							id: environment.id,
							repositoryFullName:
								environment.repositories?.[0]?.fullName ?? null,
						})
					}
				>
					<LuContainer className={iconClassName} />
					<span className="truncate">{environment.name}</span>
				</Item>
			))}
			<Separator />
			<Item onSelect={() => void navigate({ to: "/settings/environments" })}>
				<LuSettings className={iconClassName} />
				<Trans>Manage environments</Trans>
			</Item>
		</>
	);
}

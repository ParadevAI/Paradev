import { Trans } from "@lingui/react/macro";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { useNavigate } from "@tanstack/react-router";
import { LuContainer, LuRefreshCw, LuSettings } from "react-icons/lu";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { repositoryFullNames as fullNamesOf } from "../../../../utils/repositorySet";
import { MOVE_MENU_PRIMITIVES, type MoveMenuKind } from "../../constants";
import { splitEnvironmentsByRepositorySet } from "./utils/splitEnvironmentsByRepositorySet";

interface MoveToCloudItemsProps {
	menu: MoveMenuKind;
	projectId: string | null;
	onSelectEnvironment: (environment: {
		id: string;
		repositoryFullNames: string[];
	}) => void;
}

/** Only environments that open exactly the workspace's repositories: a move refuses any other. */
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
	const names = project ? fullNamesOf(project.repositories) : [];
	const repositoryFullNames =
		project && names.length > 0 && names.length === project.repositories.length
			? names
			: null;
	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId && repositoryFullNames !== null },
	);
	const environments = splitEnvironmentsByRepositorySet({
		environments: startableCloudEnvironments(environmentsQuery.data ?? []),
		repositoryFullNames,
	}).matching;

	return (
		<>
			{repositoryFullNames !== null && environmentsQuery.isLoading ? (
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
							repositoryFullNames:
								environment.repositories?.map(
									(repository) => repository.fullName,
								) ?? [],
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

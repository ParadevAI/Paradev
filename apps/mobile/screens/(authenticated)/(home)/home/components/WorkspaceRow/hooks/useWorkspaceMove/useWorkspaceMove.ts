import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	environmentsForRepository,
	startableCloudEnvironments,
} from "@superset/shared/cloud-environments";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	listMoveDestinationComputers,
	type MoveDestinationComputer,
} from "@superset/shared/move-book";
import { useQueryClient } from "@tanstack/react-query";
import { useFeatureFlag } from "posthog-react-native";
import { useMemo } from "react";
import { Alert } from "react-native";
import {
	type CloudEnvironmentRow,
	useCloudEnvironments,
} from "@/hooks/useCloudEnvironments";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isMissingProcedureError } from "@/lib/host-service/errors";

type Destination =
	| { kind: "cloud"; environmentId: string }
	| { kind: "computer"; hostId: string };

/**
 * Moves a workspace off its computer. The computer carries out the move
 * itself, so the phone only asks for it and can close straight after.
 */
export function useWorkspaceMove(
	workspace: HostWorkspaceItem,
	cache: HostWorkspacesCacheOps,
	/** Cloud workspaces do not move from the phone. */
	isCloud: boolean,
) {
	const { t } = useLingui();
	const name = workspace.name;
	const queryClient = useQueryClient();
	const movesEnabled = Boolean(useFeatureFlag(FEATURE_FLAGS.WORKSPACE_MOVES));
	const cloudEnabled = Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
	const { hosts } = useOrgHosts();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const { data: environments } = useCloudEnvironments();
	const enabled = movesEnabled && !isCloud;

	const computers = useMemo<MoveDestinationComputer[]>(
		() =>
			enabled
				? listMoveDestinationComputers({
						hosts,
						fromHostId: workspace.hostId,
						thisHostId: null,
						cloudHostIds: new Set(cloudWorkspaces.map((row) => row.id)),
					})
				: [],
		[enabled, hosts, workspace.hostId, cloudWorkspaces],
	);
	const startable = useMemo(
		() => startableCloudEnvironments(environments ?? []),
		[environments],
	);
	const canMoveToCloud = enabled && cloudEnabled && startable.length > 0;
	const sourceName =
		hosts.find((host) => host.machineId === workspace.hostId)?.name ??
		t({ message: "that computer" });

	const sourceUrl = () => {
		const url = cache.resolveHostUrl(workspace.hostId);
		if (!url) Alert.alert(t({ message: "Host is not online" }));
		return url;
	};

	const send = async (target: Destination, destination: string) => {
		const url = sourceUrl();
		if (!url) return;
		try {
			await getHostServiceClientByUrl(url).teleport.moveWorkspace.mutate({
				workspaceId: workspace.id,
				destination: target,
			});
			Alert.alert(
				t({
					message: `Moving ${name} to ${destination}`,
				}),
				t({
					message: "The moved workspace shows on Home when it is ready.",
				}),
			);
		} catch (error) {
			Alert.alert(
				t({ message: `Couldn't move ${name}` }),
				isMissingProcedureError(error)
					? t({
							message: `Update Paradev on ${sourceName} to move its workspaces from this phone.`,
						})
					: errorMessage(error, t({ message: "Unknown error" })),
			);
		}
	};

	const confirm = (
		title: string,
		description: string,
		confirmText: string,
		onConfirm: () => void,
	) =>
		Alert.alert(title, description, [
			{ text: t({ message: "Cancel" }), style: "cancel" },
			{ text: confirmText, onPress: onConfirm },
		]);

	const moveToComputer = (computer: MoveDestinationComputer) => {
		const computerName = computer.name ?? t({ message: "that computer" });
		confirm(
			t({ message: `Move this workspace to ${computerName}?` }),
			t({
				message: `Its work, including uncommitted changes, is pushed to a new branch. A workspace on ${computerName} starts from that branch, and each Claude chat continues there. Agents that are working stop first. Terminals and other chats stay where they are.`,
			}),
			t({ message: "Move" }),
			() =>
				void send({ kind: "computer", hostId: computer.hostId }, computerName),
		);
	};

	const repositoryOfWorkspace = async (url: string) => {
		const projects = await queryClient.fetchQuery({
			queryKey: [
				"host-service",
				"projects",
				"list",
				workspace.hostId,
				url,
			] as const,
			queryFn: () => getHostServiceClientByUrl(url).project.list.query(),
			staleTime: 30_000,
		});
		const project = projects.find((row) => row.id === workspace.projectId);
		return project?.repoOwner && project.repoName
			? `${project.repoOwner}/${project.repoName}`
			: null;
	};

	const confirmCloud = (environment: CloudEnvironmentRow) =>
		confirm(
			t({ message: "Move this workspace to the cloud?" }),
			t({
				message:
					"Your work, including uncommitted changes, is pushed to a new branch on the remote. A cloud workspace starts from that branch in the environment you pick, and each Claude chat continues there. Agents that are working stop first. Terminals and other chats stay here.",
			}),
			t({ message: "Move to cloud" }),
			() =>
				void send(
					{ kind: "cloud", environmentId: environment.id },
					t({ message: "the cloud" }),
				),
		);

	const moveToCloud = async () => {
		const url = sourceUrl();
		if (!url) return;
		const repository = await repositoryOfWorkspace(url).catch(() => null);
		if (!repository) {
			Alert.alert(
				t({ message: `Couldn't move ${name}` }),
				t({ message: "This workspace's project is not on GitHub." }),
			);
			return;
		}
		const matching = environmentsForRepository(startable, repository);
		const [only] = matching;
		if (!only) {
			Alert.alert(
				t({ message: `Couldn't move ${name}` }),
				t({ message: `No cloud environment opens ${repository}.` }),
			);
			return;
		}
		if (matching.length === 1) {
			confirmCloud(only);
			return;
		}
		Alert.alert(t({ message: "Pick an environment" }), undefined, [
			...matching.map((environment) => ({
				text: environment.name,
				onPress: () => confirmCloud(environment),
			})),
			{ text: t({ message: "Cancel" }), style: "cancel" as const },
		]);
	};

	return {
		computers,
		canMoveToCloud,
		moveToCloud: () => void moveToCloud(),
		moveToComputer,
	};
}

import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import type { MachineSize } from "@superset/shared/billing";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { HiOutlineComputerDesktop, HiOutlineServer } from "react-icons/hi2";
import { LuBox, LuContainer, LuCpu } from "react-icons/lu";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type { MachineSizeOption } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceHostOptions } from "../../../DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import type { EnvironmentOption } from "../../../DashboardNewWorkspaceForm/PromptGroup/components/EnvironmentPickerPill";
import type { ProjectOption } from "../../../DashboardNewWorkspaceForm/PromptGroup/types";

const SETTING_MENTION_TRIGGER = "#";

interface UseWorkspaceSettingMentionProvidersOptions {
	projects: ProjectOption[];
	onSelectProject: (projectId: string | null) => void;
	onSelectHostId: (hostId: string | null) => void;
	cloud: {
		environments: EnvironmentOption[];
		onSelectEnvironment: (environmentId: string) => void;
		machineSizes: MachineSizeOption[];
		onSelectMachineSize: (machineSize: MachineSize) => void;
	} | null;
}

export function useWorkspaceSettingMentionProviders({
	projects,
	onSelectProject,
	onSelectHostId,
	cloud,
}: UseWorkspaceSettingMentionProvidersOptions): ComposerMentionProvider[] {
	const { t } = useLingui();
	const { machineId } = useLocalHostService();
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { currentDeviceName, otherHosts } = useWorkspaceHostOptions();

	return useMemo(() => {
		const staticProvider = (
			provider: Omit<ComposerMentionProvider, "trigger" | "source">,
			entries: ComposerMentionEntry[],
		): ComposerMentionProvider => ({
			...provider,
			trigger: SETTING_MENTION_TRIGGER,
			source: { kind: "static", load: () => entries },
		});

		const projectKeywords = [t({ message: "project" }), "project"];
		const hostKeywords = [t({ message: "host" }), "host"];
		const providers = [
			staticProvider(
				{
					id: "workspace-projects",
					title: t({ message: "Project" }),
					priority: 1,
				},
				[
					...projects.map((project) => ({
						id: `project:${project.id}`,
						label: project.name,
						keywords: projectKeywords,
						icon: (
							<ProjectThumbnail
								projectName={project.name}
								iconUrl={project.iconUrl}
							/>
						),
						select: () => onSelectProject(project.id),
					})),
					{
						id: "project:none",
						label: t({ message: "No project" }),
						keywords: projectKeywords,
						icon: <LuBox className="size-4" />,
						select: () => onSelectProject(null),
					},
				],
			),
			staticProvider(
				{ id: "workspace-hosts", title: t({ message: "Host" }), priority: 2 },
				[
					{
						id: "host:local",
						label: t({ message: "Local Device" }),
						description: currentDeviceName ?? undefined,
						keywords: hostKeywords,
						icon: <HiOutlineComputerDesktop className="size-4" />,
						select: () => onSelectHostId(machineId),
					},
					...(cloudEnabled
						? [
								{
									id: "host:cloud",
									label: t({ message: "Cloud" }),
									keywords: hostKeywords,
									icon: <CloudGlyph className="size-4" />,
									select: () => onSelectHostId(CLOUD_HOST_ID),
								},
							]
						: []),
					...otherHosts.map((host) => ({
						id: `host:${host.id}`,
						label: host.name,
						description: host.isOnline ? undefined : t({ message: "offline" }),
						keywords: hostKeywords,
						icon: <HiOutlineServer className="size-4" />,
						select: () => onSelectHostId(host.id),
					})),
				],
			),
		];
		if (!cloud) return providers;

		const environmentKeywords = [t({ message: "environment" }), "environment"];
		const sizeKeywords = [t({ message: "size" }), "size"];
		return [
			...providers,
			staticProvider(
				{
					id: "workspace-environments",
					title: t({ message: "Environment" }),
					priority: 3,
				},
				cloud.environments.map((environment) => ({
					id: `environment:${environment.id}`,
					label: environment.name,
					keywords: environmentKeywords,
					icon: <LuContainer className="size-4" />,
					select: () => cloud.onSelectEnvironment(environment.id),
				})),
			),
			staticProvider(
				{
					id: "workspace-machine-sizes",
					title: t({ message: "Machine size" }),
					priority: 4,
				},
				cloud.machineSizes.map((option) => ({
					id: `machine-size:${option.size}`,
					label: option.name,
					description: option.spec,
					keywords: [...sizeKeywords, option.size],
					icon: <LuCpu className="size-4" />,
					select: () => cloud.onSelectMachineSize(option.size),
				})),
			),
		];
	}, [
		t,
		projects,
		onSelectProject,
		onSelectHostId,
		cloud,
		machineId,
		cloudEnabled,
		currentDeviceName,
		otherHosts,
	]);
}

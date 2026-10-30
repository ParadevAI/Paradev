import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import type { WindowTab, WindowTabKind } from "renderer/stores/window-tabs";

/** Tab titles by tab id: section names, and live workspace names for workspace tabs. */
export function useWindowTabTitles(tabs: WindowTab[]): Map<string, string> {
	const { t } = useLingui();
	const { workspaces } = useHostWorkspaces();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	return useMemo(() => {
		const sectionTitles: Record<Exclude<WindowTabKind, "workspace">, string> = {
			home: t({ message: "New thread" }),
			workspaces: t({ message: "Workspaces" }),
			channels: t({ message: "Chat" }),
			devs: t({ message: "Devs" }),
			tasks: t({ message: "Tasks" }),
			"pull-requests": t({ message: "Pull requests" }),
			pages: t({ message: "Pages" }),
			automations: t({ message: "Automations" }),
			plugins: t({ message: "Plugins" }),
			projects: t({ message: "Projects" }),
			environments: t({ message: "Environments" }),
			"cloud-workspaces": t({ message: "Cloud workspaces" }),
		};
		return new Map(
			tabs.map((tab) => {
				if (tab.kind !== "workspace") return [tab.id, sectionTitles[tab.kind]];
				const workspace = workspaces.find(
					(candidate) => candidate.id === tab.workspaceId,
				);
				const cloud = cloudWorkspaces?.find(
					(candidate) => candidate.id === tab.workspaceId,
				);
				return [
					tab.id,
					workspace?.name ||
						workspace?.branch ||
						cloud?.name ||
						t({ message: "Workspace" }),
				];
			}),
		);
	}, [tabs, workspaces, cloudWorkspaces, t]);
}

import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import type { ComponentType } from "react";
import { PiChatsCircle, PiClockClockwise } from "react-icons/pi";
import { TbGitPullRequest, TbNote, TbStack2 } from "react-icons/tb";
import { VscExtensions } from "react-icons/vsc";
import { env } from "renderer/env.renderer";
import type { useDashboardNavigation } from "renderer/routes/_authenticated/_dashboard/hooks/useDashboardNavigation";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { SolarCheckCircleIcon } from "../../components/SolarCheckCircleIcon";
import {
	isRailDestinationPinned,
	type RailDestinationId,
	resolveRailOrder,
	useRailPinsStore,
} from "../../stores/railPinsStore";

export interface RailDestination {
	id: RailDestinationId;
	label: string;
	alertLabel?: string;
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	isIconFilled?: boolean;
	isActive: boolean;
	isPinned: boolean;
	onClick: () => void;
}

export function useRailDestinations(
	navigation: ReturnType<typeof useDashboardNavigation>,
): RailDestination[] {
	const { t } = useLingui();
	const pinOverrides = useRailPinsStore((state) => state.pinOverrides);
	const railOrder = resolveRailOrder(useRailPinsStore((state) => state.order));
	const isChannelsEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	// `?? false`: the hook returns undefined until PostHog flags resolve.
	// Dev builds bypass the flag — the local dev account isn't in the
	// @superset.sh release condition.
	const isPluginsEnabled =
		(useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS) ?? false) ||
		env.NODE_ENV === "development";
	const { myFailedCount } = useFailedAutomations();

	const destinations: (Omit<RailDestination, "isPinned"> & {
		isAvailable?: boolean;
	})[] = [
		{
			id: "workspaces",
			label: t({ message: "Workspaces" }),
			icon: TbStack2,
			isActive: navigation.isWorkspacesOpen,
			onClick: navigation.openWorkspaces,
		},
		{
			id: "chat",
			label: t({ message: "Chat" }),
			icon: PiChatsCircle,
			isIconFilled: true,
			isActive: navigation.isChannelsOpen,
			onClick: navigation.openChannels,
			isAvailable: isChannelsEnabled,
		},
		{
			id: "pages",
			label: t({ message: "Pages" }),
			icon: TbNote,
			isActive: navigation.isPagesOpen,
			onClick: navigation.openPages,
		},
		{
			id: "plugins",
			label: t({ message: "Plugins" }),
			icon: VscExtensions,
			isIconFilled: true,
			isActive: navigation.isPluginsOpen,
			onClick: navigation.openPlugins,
			isAvailable: isPluginsEnabled,
		},
		{
			id: "automations",
			label: t({ message: "Automations" }),
			alertLabel:
				myFailedCount > 0
					? t({ message: `Automations (${myFailedCount} failing)` })
					: undefined,
			icon: PiClockClockwise,
			isIconFilled: true,
			isActive: navigation.isAutomationsOpen,
			onClick:
				myFailedCount > 0
					? navigation.openFailedAutomations
					: navigation.openAutomations,
		},
		{
			id: "tasks",
			label: t({ message: "Tasks" }),
			icon: SolarCheckCircleIcon,
			isActive: navigation.isTasksOpen,
			onClick: navigation.openTasks,
		},
		{
			id: "pullRequests",
			label: t({ message: "Pull requests" }),
			icon: TbGitPullRequest,
			isActive: navigation.isPullRequestsOpen,
			onClick: navigation.openPullRequests,
		},
	];

	return destinations
		.filter(({ isAvailable = true }) => isAvailable)
		.sort((a, b) => railOrder.indexOf(a.id) - railOrder.indexOf(b.id))
		.map(({ isAvailable: _isAvailable, ...destination }) => ({
			...destination,
			isPinned: isRailDestinationPinned(pinOverrides, destination.id),
		}));
}

import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	Cable,
	GitPullRequest,
	Hash,
	House,
	SquareCheckBig,
	StickyNote,
	TimerReset,
} from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { env } from "renderer/env.renderer";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { RailButton } from "./components/RailButton";
import { RailMoreMenu } from "./components/RailMoreMenu";
import { useDashboardNavigation } from "./hooks/useDashboardNavigation";

export const NAVIGATION_RAIL_WIDTH = 52;

/** The window's left column: one icon per section, with updates and the account at the foot. */
export function NavigationRail() {
	const { t } = useLingui();
	const navigation = useDashboardNavigation();
	const isChannelsEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	// `?? false`: the hook returns undefined until PostHog flags resolve.
	// Dev builds bypass the flag — the local dev account isn't in the
	// @superset.sh release condition.
	const isPluginsEnabled =
		(useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS) ?? false) ||
		env.NODE_ENV === "development";
	const { myFailedCount } = useFailedAutomations();

	return (
		<nav
			aria-label={t({ message: "Sections" })}
			className="flex shrink-0 flex-col items-center gap-1.5 pt-1 pb-2"
			style={{ width: NAVIGATION_RAIL_WIDTH }}
		>
			<RailButton
				label={t({ message: "Home" })}
				icon={House}
				isActive={navigation.isHomeOpen}
				onClick={navigation.openHome}
			/>
			{isChannelsEnabled && (
				<RailButton
					label={t({ message: "Chat" })}
					icon={Hash}
					isActive={navigation.isChannelsOpen}
					onClick={navigation.openChannels}
				/>
			)}
			<RailButton
				label={t({ message: "Pages" })}
				icon={StickyNote}
				isActive={navigation.isPagesOpen}
				onClick={navigation.openPages}
			/>
			{isPluginsEnabled && (
				<RailButton
					label={t({ message: "Plugins" })}
					icon={Cable}
					isActive={navigation.isPluginsOpen}
					onClick={navigation.openPlugins}
				/>
			)}
			<RailButton
				label={
					myFailedCount > 0
						? t({ message: `Automations (${myFailedCount} failing)` })
						: t({ message: "Automations" })
				}
				icon={TimerReset}
				isActive={navigation.isAutomationsOpen}
				onClick={navigation.openAutomations}
				badge={
					myFailedCount > 0 ? (
						<span
							aria-hidden="true"
							className="absolute top-2 right-2 size-1.5 rounded-full bg-red-500"
						/>
					) : undefined
				}
			/>
			<RailButton
				label={t({ message: "Tasks" })}
				icon={SquareCheckBig}
				isActive={navigation.isTasksOpen}
				onClick={navigation.openTasks}
			/>
			<RailButton
				label={t({ message: "Pull requests" })}
				icon={GitPullRequest}
				isActive={navigation.isPullRequestsOpen}
				onClick={navigation.openPullRequests}
			/>
			<RailMoreMenu />
			<div className="mt-auto flex flex-col items-center gap-1.5">
				<UpdatesPill isCollapsed />
				<OrganizationDropdown variant="rail" />
			</div>
		</nav>
	);
}

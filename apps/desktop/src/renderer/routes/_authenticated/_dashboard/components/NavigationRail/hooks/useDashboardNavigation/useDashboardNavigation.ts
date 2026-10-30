import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	pullRequestsSearchFromFilters,
	usePullRequestsFilterStore,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsFilterStore";
import {
	tasksSearchFromFilters,
	useTasksFilterStore,
} from "renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state";
import {
	getUsageLastSection,
	usageSectionPath,
} from "renderer/routes/_authenticated/settings/usage/utils/usageLastSection";

/** The rail's destinations. Each list screen reopens with the filters it last showed. */
export function useDashboardNavigation() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { gateFeature, hasAccess } = usePaywall();
	const cloudUtils = cloudTrpc.useUtils();
	const tasksFilters = useTasksFilterStore();
	const pullRequestsFilters = usePullRequestsFilterStore();

	// Automations are Pro, but an org that already has some (a downgrade) can
	// still reach the list to pause, edit, or delete them; the page gates the
	// actions that need the plan. A Free org with none meets the paywall here.
	// If the list can't be read the answer is unknown, so let the click
	// through: an empty list page gates every action itself, and a wrong
	// paywall on a downgraded org would be the worse mistake.
	const openAutomations = async () => {
		if (hasAccess(GATED_FEATURES.AUTOMATIONS)) {
			navigate({ to: "/automations" });
			return;
		}
		const automations = await cloudUtils.automation.list
			.fetch()
			.catch(() => null);
		if (automations === null || automations.length > 0) {
			navigate({ to: "/automations" });
			return;
		}
		gateFeature(GATED_FEATURES.AUTOMATIONS, () => {
			navigate({ to: "/automations" });
		});
	};

	return {
		isHomeOpen: !!matchRoute({ to: "/new-workspace" }),
		openHome: () => navigate({ to: "/new-workspace" }),

		isChannelsOpen: !!matchRoute({ to: "/channels", fuzzy: true }),
		openChannels: () => navigate({ to: "/channels/threads" }),

		isWorkspacesOpen: !!matchRoute({ to: "/v2-workspaces" }),
		openWorkspaces: () => navigate({ to: "/v2-workspaces" }),

		isAutomationsOpen: !!matchRoute({ to: "/automations", fuzzy: true }),
		openAutomations,

		isTasksOpen: !!matchRoute({ to: "/tasks", fuzzy: true }),
		openTasks: () =>
			gateFeature(GATED_FEATURES.TASKS, () => {
				navigate({
					to: "/tasks",
					search: tasksSearchFromFilters({
						tab: tasksFilters.tab,
						assignee: tasksFilters.assignee,
						label: tasksFilters.label,
						search: tasksFilters.search,
						typeTab: tasksFilters.typeTab,
						projectFilters: tasksFilters.projectFilters,
						includeClosedIssues: tasksFilters.includeClosedIssues,
					}),
				});
			}),

		isPullRequestsOpen: !!matchRoute({ to: "/pull-requests", fuzzy: true }),
		openPullRequests: () =>
			navigate({
				to: "/pull-requests",
				search: pullRequestsSearchFromFilters({
					search: pullRequestsFilters.search,
					projectFilters: pullRequestsFilters.projectFilters,
					authorFilter: pullRequestsFilters.authorFilter,
					reviewFilter: pullRequestsFilters.reviewFilter,
					includeClosed: pullRequestsFilters.includeClosed,
					mergedOnly: pullRequestsFilters.mergedOnly,
				}),
			}),

		isPagesOpen: !!matchRoute({ to: "/pages", fuzzy: true }),
		openPages: () => navigate({ to: "/pages" }),

		isPluginsOpen: !!matchRoute({ to: "/plugins", fuzzy: true }),
		openPlugins: () => navigate({ to: "/plugins" }),

		// Reopens whichever Usage section (token / machine resources) was
		// visited last.
		openUsage: () => navigate({ to: usageSectionPath(getUsageLastSection()) }),
	};
}

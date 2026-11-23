import { useNavigate } from "@tanstack/react-router";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { useSettings } from "renderer/stores/settings";
import { RailUsageRing } from "./components/RailUsageRing";
import { selectRailUsage } from "./utils/selectRailUsage";

export function RailUsage() {
	const navigate = useNavigate();
	const { activeHostUrl } = useLocalHostService();
	const isShown = useSettings((s) => s.showRailUsage);
	const hiddenProviders = useSettings((s) => s.hiddenRailUsageProviders);
	const quota = useHostUsageQuota(isShown ? activeHostUrl : null);
	if (!isShown) return null;
	const entries = selectRailUsage(quota.data ?? [], hiddenProviders);

	return entries.map((entry) => (
		<RailUsageRing
			key={entry.account.agent}
			entry={entry}
			onOpen={() =>
				navigate({
					to: "/settings/usage",
					search: {
						agent: entry.account.agent,
						accountKey: entry.account.accountKey,
					},
				})
			}
		/>
	));
}

import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { PageLink } from "@superset/ui/page-link";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CloudUsageBanner } from "../CloudUsageBanner";

export function CloudUsageRefusedBanner({
	workspaceId,
	error,
}: {
	workspaceId: string;
	error: unknown;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();

	return (
		<CloudUsageBanner
			tone="destructive"
			message={errorMessage(error)}
			actions={
				<>
					<PageLink>
						<Link to="/settings/billing">{t({ message: "Billing" })}</Link>
					</PageLink>
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							queryClient.invalidateQueries({
								queryKey: ["cloud-workspace", "wake", workspaceId],
							})
						}
					>
						{t({ message: "Retry" })}
					</Button>
				</>
			}
		/>
	);
}

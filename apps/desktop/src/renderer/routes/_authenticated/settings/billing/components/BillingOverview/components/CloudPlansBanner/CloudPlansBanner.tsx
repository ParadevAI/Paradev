import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { LuCloud } from "react-icons/lu";

export function CloudPlansBanner({ planNames }: { planNames: string[] }) {
	const { formatList } = useFormat();
	const plans = formatList(planNames);

	return (
		<div className="flex items-start gap-3 rounded-md border border-primary/40 bg-primary/5 p-4 text-sm">
			<LuCloud className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<div>
				<p className="font-medium">
					<Trans>Cloud workspaces come with the {plans} plans.</Trans>
				</p>
				<p className="mt-1 text-muted-foreground">
					<Trans>
						Upgrade to one of the highlighted plans to run agents in the cloud.
						The plan applies to this whole organization.
					</Trans>
				</p>
			</div>
		</div>
	);
}

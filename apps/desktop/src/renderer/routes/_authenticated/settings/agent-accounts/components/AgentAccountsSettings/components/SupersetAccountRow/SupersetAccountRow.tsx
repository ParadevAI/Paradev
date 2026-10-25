import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Check } from "lucide-react";
import { AgentIcon } from "renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/components/AgentIcon";

/** An agent that signs in with the person's Superset account, so there is nothing to set up. */
export function SupersetAccountRow({
	presetId,
	label,
}: {
	presetId: string;
	label: string;
}) {
	return (
		<div className="flex items-center gap-4 py-4">
			<div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
				<AgentIcon className="size-4" iconId={null} presetId={presetId} />
			</div>
			<div className="min-w-0 flex-1 text-sm font-medium">{label}</div>
			<Button className="gap-2" disabled size="sm" variant="outline">
				<Trans>Connected</Trans>
				<Check className="size-4 text-emerald-500" />
			</Button>
		</div>
	);
}

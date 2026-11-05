import { Trans } from "@lingui/react/macro";
import { Check } from "lucide-react";
import Image from "next/image";
import { AGENT_TARGETS } from "../../../../constants";

export function AgentTargets() {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
			<div className="flex h-10 items-center gap-2 border-border border-b px-4 text-xs">
				<span className="font-medium text-foreground">
					<Trans>Ready in</Trans>
				</span>
				<span className="ml-auto font-mono text-muted-foreground">
					acme-deploy
				</span>
			</div>
			<ul className="divide-y divide-border/60 px-4 py-1">
				{AGENT_TARGETS.map((agent) => (
					<li key={agent.name} className="flex items-center gap-3 py-3 text-sm">
						<span className="flex w-5 shrink-0 items-center justify-center">
							<Image src={agent.icon} alt="" width={18} height={18} />
						</span>
						<span className="flex-1 truncate text-foreground">
							{agent.name}
						</span>
						<Check aria-hidden="true" className="size-4 text-emerald-500" />
					</li>
				))}
			</ul>
		</div>
	);
}

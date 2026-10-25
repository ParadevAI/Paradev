import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import { AGENT_TARGETS } from "../../constants";

export function AgentStrip() {
	return (
		<div className="mt-8 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-muted-foreground text-xs">
			<span>
				<Trans>Works in</Trans>
			</span>
			{AGENT_TARGETS.map((agent) => (
				<span key={agent.name} className="flex items-center gap-1.5">
					<Image src={agent.icon} alt="" width={13} height={13} />
					<span className="text-foreground/80">{agent.name}</span>
				</span>
			))}
		</div>
	);
}

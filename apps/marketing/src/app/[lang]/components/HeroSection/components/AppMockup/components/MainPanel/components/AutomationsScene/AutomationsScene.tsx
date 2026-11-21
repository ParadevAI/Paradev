import { Trans, useLingui } from "@lingui/react/macro";
import { LuZap } from "react-icons/lu";
import { AUTOMATIONS } from "../../../../constants";
import { ShimmerText } from "../../../ShimmerText";

export function AutomationsScene() {
	const { t } = useLingui();

	return (
		<div className="mx-auto w-full max-w-[760px] px-10 pt-8">
			<div className="grid grid-cols-[1fr_180px_120px] items-center gap-x-6">
				<div className="col-span-3 grid grid-cols-subgrid pb-2 pl-2 text-[12px] font-medium text-neutral-100/50">
					<span>
						<Trans>Name</Trans>
					</span>
					<span>
						<Trans>Schedule</Trans>
					</span>
					<span>
						<Trans>Last run</Trans>
					</span>
				</div>
				{AUTOMATIONS.map((automation) => (
					<div
						key={automation.name}
						className={`col-span-3 grid h-10 grid-cols-subgrid items-center rounded-md pl-2 ${automation.running ? "bg-neutral-100/[0.06]" : ""}`}
					>
						<span className="flex items-center gap-2 text-neutral-100/90">
							<LuZap className="size-4 text-neutral-100/40" />
							<span className="font-mono text-[12px]">{automation.name}</span>
						</span>
						<span className="text-neutral-100/55">
							{t(automation.schedule)}
						</span>
						{automation.running ? (
							<ShimmerText>
								<Trans>running</Trans>
							</ShimmerText>
						) : (
							<span className="text-neutral-100/55">
								{t(automation.lastRun)}
							</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

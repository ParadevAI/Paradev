"use client";

import { Trans } from "@lingui/react/macro";
import { m } from "framer-motion";
import { LuCheck, LuSquareTerminal } from "react-icons/lu";
import type { PagePhase } from "../../../../types";
import { AgentLogo } from "../../../AgentLogo";
import { Composer } from "../Composer";
import { Step } from "../Step";

interface PagesSceneProps {
	phase: PagePhase;
}

export function PagesScene({ phase }: PagesSceneProps) {
	return (
		<div className="flex h-full flex-col gap-4 px-10 pt-5 pb-5">
			<div className="flex min-h-0 flex-1 flex-col gap-7 overflow-hidden">
				<div className="flex flex-col items-end gap-1.5">
					<div className="flex gap-1.5 text-[12px] leading-4">
						<span className="text-neutral-100/70">
							<Trans>You</Trans>
						</span>
						<span className="text-neutral-100/40">3m</span>
					</div>
					<div className="max-w-[440px] rounded-[10px] bg-neutral-100/[0.04] px-3 py-2 text-neutral-100/90">
						<Trans>turn the onboarding findings into a page</Trans>
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2 pb-1">
						<AgentLogo agent="claude" />
						<span className="text-neutral-100/90">Claude Code</span>
						<span className="text-[12px] text-neutral-100/40">2m</span>
					</div>
					<Step icon={LuSquareTerminal}>
						<span className="font-mono text-[12px] text-neutral-100/70">
							superset pages publish onboarding.html
						</span>
					</Step>
					<Step icon={LuCheck}>
						<span className="text-neutral-100/90">
							<Trans>Published version 1.</Trans>
						</span>
					</Step>
					<m.div
						initial={false}
						animate={{ opacity: phase === "revised" ? 1 : 0 }}
						transition={{ duration: 0.25 }}
					>
						<Step icon={LuCheck}>
							<span className="text-neutral-100/90">
								<Trans>Rewrote it and published version 2.</Trans>
							</span>
						</Step>
					</m.div>
				</div>
			</div>
			<Composer />
		</div>
	);
}

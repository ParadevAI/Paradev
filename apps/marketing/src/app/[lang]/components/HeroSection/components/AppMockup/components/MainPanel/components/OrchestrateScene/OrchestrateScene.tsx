import { Trans } from "@lingui/react/macro";
import {
	LuChevronRight,
	LuEye,
	LuPencil,
	LuSquareTerminal,
} from "react-icons/lu";
import { AgentLogo } from "../../../AgentLogo";
import { Composer } from "../Composer";
import { Step } from "../Step";
import { Code } from "./components/Code";

export function OrchestrateScene() {
	"use no memo";
	const chevron = <LuChevronRight className="size-4 text-neutral-100/40" />;

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
						<Trans>
							Move Settings into a modal so people don't leave their workspace.
							Keep the search filtering, and make ⌘, open it from anywhere.
						</Trans>
					</div>
				</div>

				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-2">
						<AgentLogo agent="claude" />
						<span className="text-neutral-100/90">Claude Code</span>
						<span className="text-[12px] text-neutral-100/40">2m</span>
					</div>

					<p className="pr-10 text-neutral-100/90">
						<Trans>
							Plan: extract <Code>SettingsPage</Code> into{" "}
							<Code>SettingsDialog</Code>, route ⌘, through the global hotkey
							layer, keep search as-is. Starting now.
						</Trans>
					</p>

					<div className="flex flex-col gap-3">
						<Step icon={LuEye} trailing={chevron}>
							<Trans>Read 3 files</Trans>
						</Step>
						<Step icon={LuPencil} trailing={chevron}>
							<Trans>
								Edited <Code>SettingsDialog.tsx</Code>
							</Trans>{" "}
							<span className="font-mono text-[12px]">+86</span>
						</Step>
						<Step icon={LuSquareTerminal} trailing={chevron}>
							<Trans>
								Ran <Code>bun test settings</Code> · 14 passed · 1 failed
							</Trans>
						</Step>
					</div>
				</div>
			</div>

			<Composer />
		</div>
	);
}

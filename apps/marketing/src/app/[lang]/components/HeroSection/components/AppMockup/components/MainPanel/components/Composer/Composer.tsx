import { Trans } from "@lingui/react/macro";
import { LuChevronDown, LuCornerDownLeft, LuPaperclip } from "react-icons/lu";
import { AgentLogo } from "@/app/[lang]/components/AgentLogo";
import { IconButton } from "../../../IconButton";

export function Composer() {
	return (
		<div className="relative flex flex-col gap-3 rounded-xl bg-[#232323] p-[9px] shadow-[inset_0_0_0_1px_rgb(245_245_245/0.06)]">
			<div className="pl-1 text-neutral-100/55">
				<Trans>Reply to Claude Code…</Trans>
			</div>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					<IconButton icon={LuPaperclip} />
					<span className="flex h-7 items-center gap-1.5 pr-1 pl-1.5 text-[12px] text-neutral-100/70">
						<Trans>Auto</Trans>
						<LuChevronDown className="size-4 text-neutral-100/40" />
					</span>
				</div>
				<div className="flex items-center gap-1">
					<span className="flex h-7 items-center gap-1.5 pr-1 pl-1.5 text-[12px] text-neutral-100/70">
						<AgentLogo agent="claude" />
						<span>
							Claude Code{" "}
							<span className="text-neutral-100/55">· Opus 5.5</span>
						</span>
						<LuChevronDown className="size-4 text-neutral-100/40" />
					</span>
					<span className="flex size-7 items-center justify-center rounded-md bg-neutral-100/10 text-neutral-100/40">
						<LuCornerDownLeft className="size-4" />
					</span>
				</div>
			</div>
		</div>
	);
}

"use client";

import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import {
	LuBox,
	LuChevronDown,
	LuCpu,
	LuGitBranch,
	LuLaptop,
	LuPlus,
} from "react-icons/lu";
import { TbCloud } from "react-icons/tb";
import { Picker } from "./components/Picker";

export function NewCloudWorkspaceDialog() {
	return (
		<div className="flex w-[560px] flex-col gap-2.5 rounded-xl border border-white/[0.1] bg-[#1b1b1b] p-3 font-sans shadow-[0_30px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]">
			<div className="flex items-center">
				<div className="flex rounded-lg border border-border/60 bg-foreground/[0.04] p-0.5 text-[10.5px]">
					<span className="flex h-6 items-center gap-1.5 rounded-md px-2.5 text-muted-foreground/70">
						<LuLaptop className="size-3" />
						<Trans>This Mac</Trans>
					</span>
					<span className="flex h-6 items-center gap-1.5 rounded-md bg-foreground/[0.1] px-2.5 text-foreground/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
						<TbCloud className="size-3" />
						<Trans>Cloud</Trans>
					</span>
				</div>
				<span className="ml-auto text-[10px] text-muted-foreground/45">⌘N</span>
			</div>

			<div className="rounded-lg border border-white/[0.09] bg-[#161616] px-3 pt-3 pb-2">
				<div className="h-12 text-[12.5px] leading-relaxed text-foreground/95">
					<Trans>Run the nightly evals and fix any regressions</Trans>
				</div>
				<div className="flex items-center gap-2">
					<LuPlus className="size-3 text-muted-foreground/60" />
					<span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 text-[10.5px] text-foreground/90">
						<Image
							src="/app-icons/claude.svg"
							alt="Claude"
							width={11}
							height={11}
						/>
						Claude Code
						<LuChevronDown className="size-2.5 text-muted-foreground/45" />
					</span>
				</div>
			</div>

			<div className="flex items-center gap-0.5">
				<Picker
					icon={
						<span className="grid size-3.5 place-items-center rounded-[3px] border border-border/60 bg-[#262626] text-[7.5px] text-muted-foreground/75">
							P
						</span>
					}
				>
					paradev
				</Picker>
				<Picker
					icon={<LuGitBranch className="size-2.5 text-muted-foreground/65" />}
				>
					<span className="font-mono">main</span>
				</Picker>
				<Picker icon={<LuBox className="size-2.5 text-muted-foreground/65" />}>
					paradev · us-east
				</Picker>
				<Picker icon={<LuCpu className="size-2.5 text-muted-foreground/65" />}>
					<Trans context="machine size">Medium</Trans>
				</Picker>
				<span className="ml-auto inline-flex h-7 items-center gap-2 rounded-md bg-foreground px-3 text-[10.5px] font-medium text-background">
					<Trans>Start workspace</Trans>
					<span className="text-[9.5px] opacity-55">⌘↵</span>
				</span>
			</div>
		</div>
	);
}

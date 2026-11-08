"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
	LuArrowUp,
	LuChevronDown,
	LuChevronsRight,
	LuFolder,
	LuGitBranch,
	LuGitFork,
	LuMic,
	LuPlus,
} from "react-icons/lu";
import { TbCloud } from "react-icons/tb";
import { Picker } from "./components/Picker";

const TYPE_START_MS = 400;
const TYPE_CHAR_MS = 32;

interface NewCloudWorkspaceDialogProps {
	active: boolean;
}

export function NewCloudWorkspaceDialog({
	active,
}: NewCloudWorkspaceDialogProps) {
	const { t } = useLingui();
	const prompt = t({
		message: "Run the nightly evals and fix any regressions",
	});
	const [typed, setTyped] = useState(prompt.length);
	const reducedMotion = useReducedMotion() ?? false;

	useEffect(() => {
		if (!active) return;
		if (reducedMotion) {
			setTyped(prompt.length);
			return;
		}
		setTyped(0);
		let interval: ReturnType<typeof setInterval>;
		const start = setTimeout(() => {
			interval = setInterval(() => {
				setTyped((count) => {
					if (count >= prompt.length) clearInterval(interval);
					return Math.min(count + 1, prompt.length);
				});
			}, TYPE_CHAR_MS);
		}, TYPE_START_MS);
		return () => {
			clearTimeout(start);
			clearInterval(interval);
		};
	}, [active, prompt, reducedMotion]);

	const ready = typed >= prompt.length;

	return (
		<div className="flex w-[600px] flex-col gap-2.5 font-sans">
			<div className="rounded-2xl border border-white/[0.08] bg-[#1c1c1c]/95 px-4 pt-3.5 pb-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm">
				<div className="h-12 text-[13.5px] leading-relaxed text-foreground/95">
					{prompt.slice(0, typed)}
					<span className="ml-px inline-block h-[15px] w-[1.5px] translate-y-[3px] bg-foreground/80 motion-safe:animate-pulse" />
				</div>
				<div className="flex items-center gap-3.5 text-[11px]">
					<LuPlus className="size-4 text-muted-foreground/70" />
					<span className="flex items-center gap-1.5 text-foreground/90">
						<LuChevronsRight className="size-4 text-brand-light" />
						<Trans>Full access</Trans>
						<LuChevronDown className="size-3 text-muted-foreground/50" />
					</span>
					<span className="ml-auto flex items-center gap-1.5 text-foreground/90">
						<Image src="/app-icons/claude.svg" alt="" width={13} height={13} />
						<Trans>Default model</Trans>
						<LuChevronDown className="size-3 text-muted-foreground/50" />
					</span>
					<LuMic className="size-4 text-muted-foreground/70" />
					<span
						className={`flex size-7 items-center justify-center rounded-lg transition-colors duration-200 ${ready ? "bg-foreground text-background" : "bg-foreground/15 text-foreground/50"}`}
					>
						<LuArrowUp className="size-4" />
					</span>
				</div>
			</div>

			<div className="flex items-center gap-1.5 px-1">
				<Picker highlighted icon={<TbCloud className="size-3.5" />}>
					<Trans>Cloud</Trans>
				</Picker>
				<Picker icon={<LuFolder className="size-3.5" />}>Paradev</Picker>
				<Picker icon={<LuGitFork className="size-3.5" />}>
					<Trans>Worktree</Trans>
				</Picker>
				<Picker icon={<LuGitBranch className="size-3.5" />}>
					<span className="font-mono">main</span>
				</Picker>
			</div>
		</div>
	);
}

"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
	LuArrowRight,
	LuFileText,
	LuGitPullRequest,
	LuPlay,
} from "react-icons/lu";
import { FILE_CHANGES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { FileChangeItem } from "../FileChangeItem";

interface RightSidebarProps {
	activeDemo: ActiveDemo;
}

const TABS = ["Files", "Changes", "Review"] as const;

export function RightSidebar({ activeDemo }: RightSidebarProps) {
	const { t } = useLingui();
	const isPages = activeDemo === "Publish Pages";

	const tabLabels: Record<(typeof TABS)[number], string> = {
		Files: t({ message: "Files" }),
		Changes: t({ message: "Changes" }),
		Review: t({ message: "Review" }),
	};

	return (
		<div className="relative flex w-[236px] shrink-0 flex-col overflow-hidden border-l border-border/60 bg-card text-[11px]">
			<div className="flex h-9 items-center gap-1 px-2">
				<button
					type="button"
					className="flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-[11px] text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground/95"
				>
					<LuPlay className="size-2.5 fill-current text-muted-foreground/65" />
					<span>
						<Trans>Run</Trans>
					</span>
				</button>
				<button
					type="button"
					className={`flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-[11px] transition-colors duration-200 ${
						isPages
							? "bg-foreground/[0.07] text-foreground/95"
							: "text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground/95"
					}`}
				>
					<LuFileText
						className={`size-2.5 ${isPages ? "text-brand-light" : "text-muted-foreground/65"}`}
					/>
					<span>
						<Trans>Pages</Trans>
					</span>
				</button>
				<button
					type="button"
					className="flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-[11px] text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground/95"
				>
					<LuGitPullRequest className="size-2.5 text-brand-light/80" />
					<span>
						<Trans>PR</Trans>
					</span>
					<span className="font-mono tabular-nums text-muted-foreground/55">
						#827
					</span>
				</button>
			</div>

			<div className="flex h-8 items-stretch">
				{TABS.map((tab) => (
					<div
						key={tab}
						className={`flex flex-1 cursor-pointer items-center justify-center text-[11px] font-medium ${
							tab === "Files"
								? "bg-background text-foreground/95"
								: "text-muted-foreground/55 hover:text-foreground/85"
						}`}
					>
						{tabLabels[tab]}
					</div>
				))}
			</div>

			<div className="bg-background px-3 pt-3 pb-2">
				<div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60">
					<span className="tabular-nums text-emerald-400/85">+393</span>
					<span className="tabular-nums text-rose-400/75">−42</span>
					<span className="text-muted-foreground/45">·</span>
					<span>
						<Plural value={5} one="# file" other="# files" />
					</span>
					<span className="text-muted-foreground/45">·</span>
					<span className="flex items-center gap-1">
						<LuArrowRight className="size-2.5" />
						<span className="rounded-sm bg-foreground/[0.07] px-1 py-px">
							main
						</span>
					</span>
				</div>
			</div>

			<div className="flex-1 space-y-0.5 overflow-hidden bg-background py-1.5">
				{FILE_CHANGES.map((file, index) => (
					<FileChangeItem
						key={`${file.path}-${index}`}
						path={file.path}
						add={file.add}
						del={file.del}
						indent={file.indent}
						type={file.type}
					/>
				))}
			</div>
		</div>
	);
}

"use client";

import { Plural, Trans } from "@lingui/react/macro";
import { m } from "framer-motion";
import {
	LuEllipsis,
	LuFileDiff,
	LuFiles,
	LuGitCommitHorizontal,
	LuGitPullRequest,
	LuGlobe,
} from "react-icons/lu";
import { CHANGED_FILES, FILE_DIFFS, SCENES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { IconButton } from "../IconButton";
import { ChangedFileRow } from "./components/ChangedFileRow";
import { FileDiff } from "./components/FileDiff";

const COLUMN_WIDTH = 440;
const COLUMN_GAP = 4;

interface RightSidebarProps {
	activeDemo: ActiveDemo;
}

export function RightSidebar({ activeDemo }: RightSidebarProps) {
	const visible = SCENES[activeDemo].showChanges;

	return (
		<m.div
			className="shrink-0 overflow-hidden"
			initial={false}
			animate={{
				width: visible ? COLUMN_WIDTH + COLUMN_GAP : 0,
				opacity: visible ? 1 : 0,
			}}
			transition={{ duration: 0.3, ease: "easeOut" }}
			aria-hidden={!visible}
		>
			<div
				className="flex h-full flex-col gap-1"
				style={{ width: COLUMN_WIDTH, marginLeft: COLUMN_GAP }}
			>
				<div className="flex h-8 shrink-0 items-center justify-between">
					<div className="flex items-center gap-1">
						<span className="flex h-7 items-center gap-1.5 rounded-md bg-neutral-100/10 pr-2.5 pl-2 text-neutral-100/90">
							<LuFileDiff className="size-4" />
							<Trans>Changes</Trans>
							<span className="rounded bg-neutral-100/10 px-[5px] text-[11px] leading-4 text-neutral-100/70">
								4
							</span>
						</span>
						<span className="flex h-7 items-center gap-1.5 pr-2.5 pl-2 text-neutral-100/55">
							<LuGlobe className="size-4" />
							<Trans>Browser</Trans>
						</span>
						<span className="flex h-7 items-center gap-1.5 pr-2.5 pl-2 text-neutral-100/55">
							<LuFiles className="size-4" />
							<Trans>Files</Trans>
						</span>
					</div>
					<IconButton icon={LuEllipsis} />
				</div>

				<div className="flex min-h-0 flex-1 flex-col rounded-xl bg-[#161616]">
					<div className="flex h-10 shrink-0 items-center justify-between py-1.5 pr-2.5 pl-4">
						<div className="flex items-center gap-2">
							<span className="flex gap-1.5 font-medium tabular-nums">
								<span className="text-[#58da98]">+128</span>
								<span className="text-[#ff6557]">−41</span>
							</span>
							<span className="text-neutral-100/55">
								<Plural value={4} one="# file" other="# files" />
							</span>
						</div>
						<IconButton icon={LuEllipsis} />
					</div>

					<div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-2 pb-3">
						<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
							<div className="flex shrink-0 flex-col">
								{CHANGED_FILES.map((file) => (
									<ChangedFileRow key={file.name} file={file} />
								))}
							</div>
							<div className="flex flex-col gap-2">
								{FILE_DIFFS.map((diff) => (
									<FileDiff key={diff.path} diff={diff} />
								))}
							</div>
						</div>
						<div className="flex shrink-0 gap-2">
							<span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md font-medium text-neutral-100/70 shadow-[inset_0_0_0_1px_rgb(245_245_245/0.1)]">
								<LuGitCommitHorizontal className="size-4" />
								<Trans>Commit</Trans>
							</span>
							<span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-neutral-100/[0.12] font-medium text-neutral-100/90">
								<LuGitPullRequest className="size-4" />
								<Trans>Open PR</Trans>
							</span>
						</div>
					</div>
				</div>
			</div>
		</m.div>
	);
}

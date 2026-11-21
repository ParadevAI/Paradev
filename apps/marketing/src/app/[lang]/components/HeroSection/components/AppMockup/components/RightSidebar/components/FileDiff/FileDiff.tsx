import { Plural, Trans } from "@lingui/react/macro";
import { LuChevronDown, LuFile } from "react-icons/lu";
import type { FileDiffData } from "../../../../types";
import { DiffLine } from "./components/DiffLine";

interface FileDiffProps {
	diff: FileDiffData;
}

export function FileDiff({ diff }: FileDiffProps) {
	return (
		<div className="shrink-0 overflow-hidden rounded-lg bg-black/[0.32]">
			<div className="flex h-8 items-center gap-1.5 bg-neutral-100/[0.04] pr-2.5 pl-2 font-mono text-[12px] leading-4">
				<LuChevronDown className="size-4 shrink-0 text-neutral-100/40" />
				<LuFile className="size-4 shrink-0 text-neutral-100/55" />
				<span className="min-w-0 flex-1 truncate text-neutral-100/90">
					{diff.path}
				</span>
				<span className="text-neutral-100/55">M</span>
				<span className="text-[#58da98]">+{diff.add}</span>
				{diff.del !== undefined && (
					<span className="text-[#ff6557]">−{diff.del}</span>
				)}
				<span className="flex items-center gap-1.5 pl-1.5 font-sans text-[13px] leading-5 text-neutral-100/55">
					<span className="size-3.5 rounded shadow-[inset_0_0_0_1.5px_rgb(245_245_245/0.32)]" />
					<Trans>Viewed</Trans>
				</span>
			</div>
			{diff.rows.map((row, index) => {
				const key = `${diff.path}-${index}`;
				if (row.kind === "separator")
					return (
						<div
							key={key}
							className="flex h-6 items-center gap-2.5 bg-neutral-100/[0.03] pl-3 text-neutral-100/40"
						>
							<LuChevronDown className="size-4" />
							<Plural
								value={row.lines}
								one="# unmodified line"
								other="# unmodified lines"
							/>
						</div>
					);
				return <DiffLine key={key} row={row} />;
			})}
		</div>
	);
}

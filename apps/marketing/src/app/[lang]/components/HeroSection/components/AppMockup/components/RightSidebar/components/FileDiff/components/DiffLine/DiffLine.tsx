import type { DiffRow } from "../../../../../../types";
import { CodeText } from "../../../CodeText";

const LINE_TONE = {
	add: {
		row: "bg-[#58da98]/[0.08]",
		bar: "bg-[#58da98]",
		mark: "bg-[#58da98]/[0.22]",
		sign: "+",
	},
	del: {
		row: "bg-[#ff6557]/[0.08]",
		bar: "bg-[#ff6557]",
		mark: "bg-[#ff6557]/[0.22]",
		sign: "−",
	},
} as const;

interface DiffLineProps {
	row: Extract<DiffRow, { kind: "line" }>;
}

export function DiffLine({ row }: DiffLineProps) {
	const tone = row.change ? LINE_TONE[row.change] : null;
	const [before, after] = row.mark ? row.code.split(row.mark) : [row.code, ""];

	return (
		<div
			className={`relative flex h-5 items-center gap-1.5 pr-2 pl-3 font-mono text-[12px] leading-5 ${tone?.row ?? ""}`}
		>
			{tone && (
				<span className={`absolute inset-y-0 left-0 w-0.5 ${tone.bar}`} />
			)}
			<span className="w-5 shrink-0 text-right text-neutral-100/40 tabular-nums">
				{row.number}
			</span>
			<span
				className={`w-2 shrink-0 ${row.change === "del" ? "text-[#ff6557]" : "text-[#58da98]"}`}
			>
				{tone?.sign}
			</span>
			<span className="whitespace-pre text-neutral-100/70">
				<CodeText code={before ?? ""} />
				{row.mark && (
					<span className={`rounded-[3px] ${tone?.mark ?? ""}`}>
						{row.mark}
					</span>
				)}
				<CodeText code={after ?? ""} />
			</span>
		</div>
	);
}

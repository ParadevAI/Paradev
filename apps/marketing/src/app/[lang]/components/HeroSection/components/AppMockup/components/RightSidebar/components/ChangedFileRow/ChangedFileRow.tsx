import { LuChevronDown, LuFile } from "react-icons/lu";
import type { ChangedFile } from "../../../../types";

interface ChangedFileRowProps {
	file: ChangedFile;
}

export function ChangedFileRow({ file }: ChangedFileRowProps) {
	const Icon = file.isDir ? LuChevronDown : LuFile;
	const tone = file.selected
		? "text-neutral-100/90"
		: file.dimmed
			? "text-neutral-100/40"
			: "text-neutral-100/70";

	return (
		<div
			className={`flex h-[26px] items-center gap-1.5 rounded-md pr-2 font-mono text-[12px] leading-4 ${file.selected ? "bg-neutral-100/[0.06]" : ""}`}
			style={{ paddingLeft: 6 + file.depth * 12 }}
		>
			<Icon className="size-4 shrink-0 text-neutral-100/40" />
			<span className={`min-w-0 flex-1 truncate ${tone}`}>{file.name}</span>
			{file.add !== undefined && (
				<span className="text-[#58da98]">+{file.add}</span>
			)}
			{file.del !== undefined && (
				<span className="text-[#ff6557]">−{file.del}</span>
			)}
			{file.badge && (
				<span
					className={file.badge === "A" ? "text-[#58da98]" : "text-[#ffb02b]"}
				>
					{file.badge}
				</span>
			)}
		</div>
	);
}

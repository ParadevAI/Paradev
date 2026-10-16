import { formatNumber } from "@superset/i18n/format";
import { useState } from "react";
import { LuChevronDown, LuFileText } from "react-icons/lu";
import type { SlackFileView } from "../../types";

interface SlackFileProps {
	file: SlackFileView;
}

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

function fileSize(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	return formatNumber(value, {
		style: "unit",
		unit: UNITS[unit],
		unitDisplay: "short",
		maximumFractionDigits: unit === 0 ? 0 : 1,
	});
}

/**
 * A file in a message as Slack shows it: an image under its name, with a caret
 * that folds it away, or a card with the file's type and size. Either opens the
 * file in Slack.
 */
export function SlackFile({ file }: SlackFileProps) {
	const [open, setOpen] = useState(true);
	const [failed, setFailed] = useState(false);

	if (file.image && !failed) {
		const { width, height } = file.image;
		return (
			<div className="flex max-w-md flex-col gap-1">
				<button
					type="button"
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
					className="flex w-fit max-w-full items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
				>
					<span className="truncate">{file.name}</span>
					<LuChevronDown
						className={
							open ? "size-3.5 shrink-0" : "size-3.5 shrink-0 -rotate-90"
						}
					/>
				</button>
				{open && (
					<a
						href={file.permalink ?? undefined}
						target="_blank"
						rel="noreferrer"
						className="block w-fit overflow-hidden rounded-lg border border-border"
					>
						<img
							src={file.image.url}
							alt={file.name}
							width={width ?? undefined}
							height={height ?? undefined}
							onError={() => setFailed(true)}
							className="block h-auto max-h-80 w-auto max-w-full object-contain"
						/>
					</a>
				)}
			</div>
		);
	}

	const details = [
		file.type?.toUpperCase(),
		file.size ? fileSize(file.size) : null,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<a
			href={file.permalink ?? undefined}
			target="_blank"
			rel="noreferrer"
			className="flex w-72 max-w-full items-center gap-2.5 rounded-lg border border-border p-2 transition-colors hover:bg-fill-hover/60"
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-blue-500 dark:text-sky-300">
				<LuFileText className="size-5" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate text-[13px] font-semibold text-foreground">
					{file.name}
				</span>
				{details && (
					<span className="truncate text-xs text-muted-foreground">
						{details}
					</span>
				)}
			</span>
		</a>
	);
}

import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuX } from "react-icons/lu";
import type { DraftFile } from "../../hooks/useDraftAttachments";
import { fileSize } from "../../utils/fileSize";

interface ComposeAttachmentsProps {
	files: DraftFile[];
	onRemove: (key: string) => void;
}

/** Gmail's compose chips: each file's name and size on a grey bar, a progress line while it uploads, × to drop it. */
export function ComposeAttachments({
	files,
	onRemove,
}: ComposeAttachmentsProps) {
	const { t } = useLingui();
	if (files.length === 0) return null;
	return (
		<ul className="flex flex-col gap-1.5 px-3 pt-2">
			{files.map((file) => (
				<li
					key={file.key}
					className={cn(
						"relative flex h-8 items-center gap-1 overflow-hidden rounded-sm bg-muted/70 pr-1 pl-2.5 text-[13px]",
						file.state === "blocked" && "bg-destructive/10",
					)}
				>
					{file.url ? (
						<a
							href={file.url}
							target="_blank"
							rel="noreferrer"
							className="min-w-0 truncate font-semibold text-blue-600 hover:underline dark:text-sky-400"
						>
							{file.name}
						</a>
					) : (
						<span
							className={cn(
								"min-w-0 truncate font-semibold",
								file.state === "blocked" || file.state === "failed"
									? "text-destructive"
									: "text-blue-600 dark:text-sky-400",
							)}
						>
							{file.name}
						</span>
					)}
					<span className="shrink-0 font-semibold text-muted-foreground">
						({fileSize(file.size)})
					</span>
					<span className="min-w-0 flex-1 truncate pl-1 text-[12px] text-muted-foreground">
						{file.state === "blocked" &&
							t({ message: "Blocked for security reasons" })}
						{file.state === "failed" && file.error}
						{file.state === "saving" && t({ message: "Attaching…" })}
					</span>
					<button
						type="button"
						aria-label={t({ message: `Remove ${file.name}` })}
						onClick={() => onRemove(file.key)}
						className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuX className="size-3.5" />
					</button>
					{file.state === "uploading" && (
						<span
							role="progressbar"
							aria-valuenow={Math.round(file.progress * 100)}
							className="absolute bottom-0 left-0 h-0.5 bg-blue-600 transition-[width] dark:bg-sky-400"
							style={{ width: `${Math.max(4, file.progress * 100)}%` }}
						/>
					)}
				</li>
			))}
		</ul>
	);
}

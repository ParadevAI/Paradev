import { useLingui } from "@lingui/react/macro";
import { fileMeta } from "@superset/chats-core";
import { LuFile, LuX } from "react-icons/lu";

/** A file waiting on the draft to be sent. */
export function AttachmentChip({
	file,
	onRemove,
}: {
	file: File;
	onRemove: () => void;
}) {
	const { t } = useLingui();
	return (
		<div className="flex max-w-56 items-center gap-2 rounded-lg bg-background/60 py-1 pr-1 pl-2 text-xs">
			<LuFile className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium">{file.name}</span>
				<span className="block truncate text-muted-foreground">
					{fileMeta(file)}
				</span>
			</span>
			<button
				type="button"
				aria-label={t({ message: `Remove ${file.name}` })}
				onClick={onRemove}
				className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
			>
				<LuX className="size-3.5" />
			</button>
		</div>
	);
}

import type { ChannelAttachment } from "@superset/shared/channels";
import { LuFileText } from "react-icons/lu";

const extensionOf = (name: string) => {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toUpperCase() : null;
};

/** A file as a card with its name and type; opening it downloads it. */
export function FileAttachment({ file }: { file: ChannelAttachment }) {
	const type = extensionOf(file.name);
	return (
		<a
			href={file.url}
			target="_blank"
			rel="noreferrer"
			download={file.name}
			className="flex w-72 max-w-full items-center gap-2.5 rounded-lg border border-border p-2 transition-colors hover:bg-fill-hover/60"
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<LuFileText className="size-5" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate text-[13px] font-semibold text-foreground">
					{file.name}
				</span>
				{type && (
					<span className="truncate text-xs text-muted-foreground">{type}</span>
				)}
			</span>
		</a>
	);
}

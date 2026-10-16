import { Trans } from "@lingui/react/macro";
import { LuExternalLink } from "react-icons/lu";

interface LinkBarProps {
	href: string;
	onEdit: () => void;
	onRemove: () => void;
}

/** With the cursor in a link, Slack offers its address, a way to open it, edit it or take it off. */
export function LinkBar({ href, onEdit, onRemove }: LinkBarProps) {
	return (
		<div className="absolute bottom-full left-0 z-20 mb-1.5 flex max-w-full items-center gap-1 rounded-lg border border-border bg-popover p-1 text-[13px] text-popover-foreground shadow-lg">
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				onMouseDown={(event) => event.preventDefault()}
				className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-blue-500 hover:bg-fill-hover dark:text-sky-400"
			>
				<LuExternalLink className="size-3.5 shrink-0" />
				<span className="max-w-64 truncate">{href}</span>
			</a>
			<span className="h-4 w-px bg-border" />
			<button
				type="button"
				onMouseDown={(event) => event.preventDefault()}
				onClick={onEdit}
				className="rounded-md px-2 py-1 hover:bg-fill-hover"
			>
				<Trans>Edit</Trans>
			</button>
			<button
				type="button"
				onMouseDown={(event) => event.preventDefault()}
				onClick={onRemove}
				className="rounded-md px-2 py-1 text-destructive hover:bg-fill-hover"
			>
				<Trans>Remove</Trans>
			</button>
		</div>
	);
}

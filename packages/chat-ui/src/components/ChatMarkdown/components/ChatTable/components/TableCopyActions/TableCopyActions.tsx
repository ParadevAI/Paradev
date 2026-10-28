import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Check, Copy } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
	type TableCopyFormat,
	tableClipboardText,
} from "../../utils/tableClipboard";

const COPIED_MS = 1500;

function CopyAction({
	children,
	copied,
	onClick,
}: {
	children: string;
	copied: boolean;
	onClick: () => void;
}) {
	const { t } = useLingui();
	return (
		<button
			className={cn(
				"flex items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground",
				copied && "text-foreground",
			)}
			onClick={onClick}
			type="button"
		>
			{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
			{copied ? t({ message: "Copied" }) : children}
		</button>
	);
}

/** Copies the table beside it as Markdown or as CSV. */
export function TableCopyActions({
	table,
}: {
	table: RefObject<HTMLTableElement | null>;
}) {
	const { t } = useLingui();
	const [copied, setCopied] = useState<TableCopyFormat | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const copy = (format: TableCopyFormat) => {
		const element = table.current;
		if (!element) return;
		navigator.clipboard.writeText(tableClipboardText(element, format)).then(
			() => {
				setCopied(format);
				if (timer.current) clearTimeout(timer.current);
				timer.current = setTimeout(() => setCopied(null), COPIED_MS);
			},
			(error: unknown) => {
				console.error("[chat] table copy failed", error);
			},
		);
	};

	return (
		<div className="mt-1 flex items-center gap-0.5 text-xs">
			<CopyAction
				copied={copied === "markdown"}
				onClick={() => copy("markdown")}
			>
				{t({ message: "Copy as Markdown" })}
			</CopyAction>
			<CopyAction copied={copied === "csv"} onClick={() => copy("csv")}>
				{t({ message: "Copy as CSV" })}
			</CopyAction>
		</div>
	);
}

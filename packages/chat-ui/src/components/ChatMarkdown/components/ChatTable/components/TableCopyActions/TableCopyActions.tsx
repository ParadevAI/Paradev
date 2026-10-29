import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Check, Copy } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
	type TableCopyFormat,
	tableClipboardText,
} from "../../utils/tableClipboard";

const COPIED_MS = 1500;

type Outcome = { format: TableCopyFormat; ok: boolean };

function CopyAction({
	children,
	onClick,
	outcome,
}: {
	children: string;
	onClick: () => void;
	outcome: boolean | null;
}) {
	const { t } = useLingui();
	return (
		<button
			className={cn(
				"flex items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground",
				outcome === true && "text-foreground",
				outcome === false && "text-destructive",
			)}
			onClick={onClick}
			type="button"
		>
			{outcome === true ? (
				<Check className="size-3" />
			) : (
				<Copy className="size-3" />
			)}
			{outcome === null
				? children
				: outcome
					? t({ message: "Copied" })
					: t({ message: "Copy failed" })}
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
	const [outcome, setOutcome] = useState<Outcome | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const show = (next: Outcome) => {
		setOutcome(next);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setOutcome(null), COPIED_MS);
	};
	const copy = (format: TableCopyFormat) => {
		const element = table.current;
		if (!element) return;
		navigator.clipboard.writeText(tableClipboardText(element, format)).then(
			() => show({ format, ok: true }),
			(error: unknown) => {
				console.error("[chat] table copy failed", error);
				show({ format, ok: false });
			},
		);
	};
	const outcomeOf = (format: TableCopyFormat) =>
		outcome?.format === format ? outcome.ok : null;

	return (
		<div className="mt-1 flex items-center gap-0.5 text-xs">
			<CopyAction
				onClick={() => copy("markdown")}
				outcome={outcomeOf("markdown")}
			>
				{t({ message: "Copy as Markdown" })}
			</CopyAction>
			<CopyAction onClick={() => copy("csv")} outcome={outcomeOf("csv")}>
				{t({ message: "Copy as CSV" })}
			</CopyAction>
		</div>
	);
}

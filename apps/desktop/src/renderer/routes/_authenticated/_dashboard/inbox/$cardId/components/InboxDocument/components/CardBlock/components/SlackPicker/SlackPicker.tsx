import { Trans } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useListCursor } from "renderer/hooks/useListCursor";
import type { SlackConversationView, SlackPersonView } from "../../types";
import { SlackChannelLabel } from "../SlackChannelLabel";
import { SlackPersonRow } from "../SlackPersonRow";

type Row =
	| { kind: "channel"; channel: SlackConversationView }
	| { kind: "person"; person: SlackPersonView };

interface SlackPickerProps {
	/** Names the search box. */
	label: string;
	people: readonly SlackPersonView[];
	channels?: readonly SlackConversationView[];
	onPickPerson: (person: SlackPersonView) => void;
	onPickChannel?: (channel: SlackConversationView) => void;
	align?: "start" | "end";
	/** The button that opens the picker. */
	children: ReactNode;
}

const ROWS_MAX = 50;

const has = (text: string | null, query: string) =>
	text?.toLowerCase().includes(query) ?? false;

/** Slack's people and channel picker: type to filter, arrows to move, Enter to take one. */
export function SlackPicker({
	label,
	people,
	channels = [],
	onPickPerson,
	onPickChannel,
	align = "start",
	children,
}: SlackPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const list = useRef<HTMLDivElement>(null);
	const q = query.trim().toLowerCase().replace(/^[#@]/, "");
	const rows: Row[] = [
		...channels
			.filter((channel) => has(channel.name, q))
			.map((channel): Row => ({ kind: "channel", channel })),
		...people
			.filter((person) => has(person.name, q) || has(person.realName, q))
			.map((person): Row => ({ kind: "person", person })),
	].slice(0, ROWS_MAX);
	const cursor = useListCursor(rows.length, query);
	const highlighted = cursor.highlighted;
	useEffect(() => {
		list.current
			?.querySelector(`[data-index="${highlighted}"]`)
			?.scrollIntoView?.({ block: "nearest" });
	}, [highlighted]);
	const pick = (row: Row) => {
		if (row.kind === "channel") onPickChannel?.(row.channel);
		else onPickPerson(row.person);
		setOpen(false);
		setQuery("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setQuery("");
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				align={align}
				className="w-[28rem] max-w-[calc(100vw-2rem)] p-0"
			>
				<input
					value={query}
					aria-label={label}
					placeholder={label}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (cursor.move(event.key)) event.preventDefault();
						else if (event.key === "Enter") {
							event.preventDefault();
							const row = rows[highlighted];
							if (row) pick(row);
						}
					}}
					className="h-9 w-full border-b border-border bg-transparent px-3.5 text-sm outline-none placeholder:text-muted-foreground"
				/>
				<div
					ref={list}
					role="listbox"
					className="max-h-64 overflow-y-auto py-1.5 text-sm text-popover-foreground"
				>
					{rows.length === 0 ? (
						<div className="px-3.5 py-1.5 text-muted-foreground">
							<Trans>No matches</Trans>
						</div>
					) : (
						rows.map((row, index) => (
							<button
								type="button"
								role="option"
								aria-selected={index === highlighted}
								key={row.kind === "channel" ? row.channel.id : row.person.id}
								data-index={index}
								onMouseEnter={() => cursor.hover(index)}
								onClick={() => pick(row)}
								className={cn(
									"flex h-8 w-full items-center gap-2 px-3.5 text-left",
									index === highlighted && "bg-fill-selected",
								)}
							>
								{row.kind === "channel" ? (
									<SlackChannelLabel channel={row.channel} />
								) : (
									<SlackPersonRow person={row.person} />
								)}
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

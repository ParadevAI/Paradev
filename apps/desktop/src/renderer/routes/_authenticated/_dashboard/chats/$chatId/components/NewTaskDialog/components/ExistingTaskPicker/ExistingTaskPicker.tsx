import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuLoader } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const SEARCH_DELAY_MS = 200;
const LIMIT = 40;

interface ExistingTaskPickerProps {
	/** Tasks already in a chat, which are left out. */
	takenIds: ReadonlySet<string>;
	isAdding: boolean;
	onPick: (taskId: string) => void;
}

/** The organization's tasks made outside the chats, searched by title, to add one to this chat. */
export function ExistingTaskPicker({
	takenIds,
	isAdding,
	onPick,
}: ExistingTaskPickerProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
	const list = cloudTrpc.task.list.useQuery(
		{ search: search || undefined, limit: LIMIT },
		{ staleTime: 30_000, placeholderData: (previous) => previous },
	);
	const rows = list.data?.filter((row) => !takenIds.has(row.task.id));

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<Input
				autoFocus
				value={query}
				placeholder={t({ message: "Search your Paradev tasks" })}
				onChange={(event) => setQuery(event.target.value)}
			/>
			<div className="-mx-1 flex h-64 flex-col overflow-y-auto">
				{!rows && !list.isError && (
					<p className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground text-sm">
						<LuLoader className="size-4 animate-spin" />
						<Trans>Loading…</Trans>
					</p>
				)}
				{list.isError && (
					<p className="px-2 py-1.5 text-muted-foreground text-sm">
						<Trans>Couldn't load your tasks.</Trans>
					</p>
				)}
				{rows?.length === 0 && (
					<p className="px-2 py-1.5 text-muted-foreground text-sm">
						<Trans>No tasks found.</Trans>
					</p>
				)}
				{rows?.map((row) => (
					<button
						key={row.task.id}
						type="button"
						disabled={isAdding}
						onClick={() => onPick(row.task.id)}
						className="flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2 text-left text-sm hover:bg-fill-hover disabled:opacity-60"
					>
						<span className="w-20 shrink-0 truncate text-muted-foreground text-xs tabular-nums">
							{row.task.slug}
						</span>
						<span className="min-w-0 flex-1 truncate">{row.task.title}</span>
						{row.statusName && (
							<span className="max-w-28 shrink-0 truncate text-muted-foreground text-xs">
								{row.statusName}
							</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
}

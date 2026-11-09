import { useLingui } from "@lingui/react/macro";
import { CommandGroup, CommandItem } from "@superset/ui/command";
import { keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuMessagesSquare } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useFrameStackStore } from "../../core/frames";

const MIN_QUERY_CHARS = 2;
const MAX_QUERY_CHARS = 200;
const DEBOUNCE_MS = 250;

/** Your chats stored in the cloud that match what is typed in the palette. */
export function ChatSearchResults({ query }: { query: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const trimmed = query.trim().slice(0, MAX_QUERY_CHARS).trim();
	const [debounced, setDebounced] = useState(trimmed);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [trimmed]);

	const search = cloudTrpc.chatHistory.search.useQuery(
		{ query: debounced, limit: 8 },
		{
			enabled: debounced.length >= MIN_QUERY_CHARS,
			staleTime: 30_000,
			retry: false,
			placeholderData: keepPreviousData,
		},
	);
	if (trimmed.length < MIN_QUERY_CHARS) return null;
	if (search.isError && trimmed === debounced) {
		return (
			<CommandGroup heading={t({ message: "Chats" })}>
				<CommandItem value="chat-search-error" disabled>
					<span className="text-muted-foreground">
						{t({ message: "Couldn't search your chats" })}
					</span>
				</CommandItem>
			</CommandGroup>
		);
	}
	const stale = trimmed !== debounced || search.isPlaceholderData;
	const results = search.data?.flatMap((result) =>
		result.workspaceId ? [{ ...result, workspaceId: result.workspaceId }] : [],
	);
	if (!results?.length) return null;

	return (
		<CommandGroup heading={t({ message: "Chats" })}>
			{results.map((result) => (
				<CommandItem
					key={result.sessionId}
					value={`chat-${result.sessionId}`}
					disabled={stale}
					onSelect={() => {
						if (stale) return;
						setOpen(false);
						void navigate({
							to: "/v2-workspace/$workspaceId",
							params: { workspaceId: result.workspaceId },
							search: {
								sessionId: result.sessionId,
								focusRequestId: crypto.randomUUID(),
							},
						});
					}}
				>
					<LuMessagesSquare className="text-muted-foreground" />
					<div className="flex min-w-0 flex-col">
						<span className="truncate">
							{result.title || t({ message: "Untitled chat" })}
						</span>
						<span className="truncate text-xs text-muted-foreground">
							{result.snippet.replace(/[«»]/g, "")}
						</span>
					</div>
				</CommandItem>
			))}
		</CommandGroup>
	);
}

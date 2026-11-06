import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { MotionConfig, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { LuMessageSquareText, LuSquareCheck } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { NewTabRow } from "./components/NewTabRow";
import { NewTabSection } from "./components/NewTabSection";
import { NEW_TAB_PAGE_VARIANTS, NEW_TAB_ROW_LIMIT } from "./constants";

interface NewTabPageProps {
	channelId: string;
	onOpenThread: (message: ChannelMessage) => void;
	onOpenTask: (task: { id: string; label: string }) => void;
}

function matches(text: string, query: string) {
	return text.toLowerCase().includes(query);
}

/** Codex's New tab, for a channel: recent threads and the channel's tasks. */
export function NewTabPage({
	channelId,
	onOpenThread,
	onOpenTask,
}: NewTabPageProps) {
	const { t } = useLingui();
	const [search, setSearch] = useState("");
	const query = search.trim().toLowerCase();
	const { data: messagePages } = cloudTrpc.channelMessage.list.useInfiniteQuery(
		{ channelId },
		{ getNextPageParam: (page) => page.nextCursor ?? undefined },
	);
	const { data: channelTasks } = cloudTrpc.channelTask.list.useQuery({
		channelId,
	});

	const threads = useMemo(
		() =>
			(messagePages?.pages ?? [])
				.flatMap((page) => page.messages)
				.filter(
					(message) =>
						message.replyCount > 0 &&
						!message.deletedAt &&
						matches(message.body, query),
				)
				.sort(
					(a, b) =>
						(b.lastReplyAt?.getTime() ?? 0) - (a.lastReplyAt?.getTime() ?? 0),
				)
				.slice(0, NEW_TAB_ROW_LIMIT),
		[messagePages, query],
	);
	const tasks = useMemo(
		() =>
			(channelTasks ?? [])
				.filter((task) => matches(`${task.slug} ${task.title}`, query))
				.slice(0, NEW_TAB_ROW_LIMIT),
		[channelTasks, query],
	);

	return (
		<div className="@container min-h-0 flex-1 overflow-y-auto px-4 py-6">
			<MotionConfig reducedMotion="user">
				<motion.div
					className="mx-auto flex max-w-3xl flex-col gap-8"
					variants={NEW_TAB_PAGE_VARIANTS}
					initial="hidden"
					animate="shown"
				>
					<input
						// biome-ignore lint/a11y/noAutofocus: a new tab is opened to search or pick
						autoFocus
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={t({ message: "Search threads and tasks" })}
						className="h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-center text-sm outline-none placeholder:text-muted-foreground focus:text-start focus:ring-1 focus:ring-ring"
					/>
					{threads.length > 0 && (
						<NewTabSection title={<Trans>Threads</Trans>}>
							{threads.map((message) => (
								<NewTabRow
									key={message.id}
									icon={<LuMessageSquareText />}
									label={message.body.replace(/\s+/g, " ")}
									meta={
										<Plural
											value={message.replyCount}
											one="# reply"
											other="# replies"
										/>
									}
									onSelect={() => onOpenThread(message)}
								/>
							))}
						</NewTabSection>
					)}
					{tasks.length > 0 && (
						<NewTabSection title={<Trans>Tasks</Trans>}>
							{tasks.map((task) => (
								<NewTabRow
									key={task.id}
									icon={<LuSquareCheck />}
									label={task.title}
									meta={task.slug}
									onSelect={() => onOpenTask({ id: task.id, label: task.slug })}
								/>
							))}
						</NewTabSection>
					)}
					{threads.length === 0 && tasks.length === 0 && (
						<p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
							{query ? (
								<Trans>No threads or tasks match</Trans>
							) : (
								<Trans>No threads or tasks yet</Trans>
							)}
						</p>
					)}
				</motion.div>
			</MotionConfig>
		</div>
	);
}

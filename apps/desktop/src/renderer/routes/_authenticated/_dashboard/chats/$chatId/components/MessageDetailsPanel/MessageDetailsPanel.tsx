import { Trans, useLingui } from "@lingui/react/macro";
import { type ChatState, chatTitle, type Message } from "@superset/chats-core";
import {
	type ApiMessageDetails,
	formatDuration,
	type SyncApi,
	tracedTurn,
	turnDuration,
} from "@superset/chats-sync";
import { formatDateTime } from "@superset/i18n/format";
import { type ReactNode, useEffect, useState } from "react";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { TurnBlocks } from "../TurnBlocks";

interface MessageDetailsPanelProps {
	state: ChatState;
	message: Message;
	load: SyncApi["messageDetails"];
	onClose: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</>
	);
}

/**
 * A message's details beside the thread: who sent it and when, and for a
 * Dev's message the turn that wrote it, with its thinking and every tool
 * call. Fetched when opened.
 */
export function MessageDetailsPanel({
	state,
	message,
	load,
	onClose,
}: MessageDetailsPanelProps) {
	const { t } = useLingui();
	const [details, setDetails] = useState<ApiMessageDetails | null>(null);
	const [hasFailed, setHasFailed] = useState(false);

	useEffect(() => {
		let isCurrent = true;
		setDetails(null);
		setHasFailed(false);
		load(message.id).then(
			(found) => isCurrent && setDetails(found),
			() => isCurrent && setHasFailed(true),
		);
		return () => {
			isCurrent = false;
		};
	}, [message.id, load]);

	const dev = message.authorDevId ? state.devs[message.authorDevId] : undefined;
	const person = message.authorId
		? message.authorId === state.meId
			? t({ message: "You" })
			: (state.members[message.authorId]?.name ?? t({ message: "Unknown" }))
		: null;
	const chat = state.chats.find((candidate) => candidate.id === message.chatId);
	const turn = details?.turn ?? null;
	const traced = details ? tracedTurn(details) : null;
	const took = turn ? turnDuration(turn) : null;
	const name = dev?.name ?? t({ message: "The Dev" });

	return (
		<aside className="flex h-full w-[420px] shrink-0 flex-col border-border border-l">
			<div className="flex h-12 shrink-0 items-center justify-between pr-3 pl-4">
				<h2 className="font-medium text-sm">
					<Trans>Message details</Trans>
				</h2>
				<button
					type="button"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
					className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuX className="size-4" />
				</button>
			</div>
			<div className="min-h-0 flex-1 select-text overflow-y-auto px-4 pb-8">
				<dl className="grid grid-cols-[72px_1fr] items-start gap-x-3 gap-y-2.5 text-[13px]">
					<Row label={t({ message: "From" })}>
						<span className="flex items-center gap-1.5">
							{dev && <DevFace devId={dev.id} size={16} />}
							{dev?.name ?? person}
						</span>
					</Row>
					<Row label={t({ message: "Sent" })}>
						{formatDateTime(new Date(message.at))}
					</Row>
					{chat && (
						<Row label={t({ message: "Chat" })}>{chatTitle(state, chat)}</Row>
					)}
					{turn?.trace?.model && (
						<Row label={t({ message: "Model" })}>
							<span className="font-mono text-xs">{turn.trace.model}</span>
						</Row>
					)}
					{turn?.startedAt && (
						<Row label={t({ message: "Started" })}>
							{formatDateTime(new Date(turn.startedAt))}
						</Row>
					)}
					{took !== null && (
						<Row label={t({ message: "Took" })}>{formatDuration(took)}</Row>
					)}
					{turn?.error && (
						<Row label={t({ message: "Failed" })}>
							<span className="text-destructive">{turn.error}</span>
						</Row>
					)}
				</dl>

				{message.turnId && (
					<section className="pt-6 text-sm">
						<h3 className="mb-2 font-medium text-muted-foreground text-xs">
							<Trans>What {name} did</Trans>
						</h3>
						{hasFailed ? (
							<p className="text-destructive">
								<Trans>
									Couldn't load it. Check your connection and try again.
								</Trans>
							</p>
						) : !details ? (
							<p className="flex items-center gap-2 text-muted-foreground">
								<LuLoaderCircle className="size-3.5 animate-spin" />
								<Trans>Loading…</Trans>
							</p>
						) : traced ? (
							<>
								<TurnBlocks
									state={state}
									live={traced.asks}
									turn={traced.turn}
								/>
								{turn?.trace?.truncated && (
									<p className="mt-2 text-muted-foreground text-xs">
										<Trans>
											The rest was left out: this turn did more than is kept.
										</Trans>
									</p>
								)}
							</>
						) : (
							<p className="text-muted-foreground">
								{turn?.status === "ended" ? (
									<Trans>
										{name}'s box didn't report what it did in this turn.
									</Trans>
								) : (
									<Trans>{name} is still working on this turn.</Trans>
								)}
							</p>
						)}
					</section>
				)}
			</div>
		</aside>
	);
}

import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { useMemo, useState } from "react";
import { LuClock } from "react-icons/lu";
import { SlackWorkspaceProvider } from "../../providers/SlackWorkspaceProvider";
import type { CardBlockViewProps } from "../../types";
import { slackWhen } from "../../utils/slackWhen";
import { MINUTE_MS } from "../../utils/zoneTime";
import { ActionButton } from "../ActionButton";
import { SlackComposer, type SlackReply } from "../SlackComposer";
import { SlackDateTime } from "../SlackDateTime";
import { Mrkdwn } from "../SlackMessage/components/Mrkdwn";
import { SlackPicker } from "../SlackPicker";
import { SlackPostTarget } from "../SlackPostTarget";
import { ScheduleMenu } from "./components/ScheduleMenu";

const GROUP_MAX = 8;
const SCHEDULE_DAYS_MAX = 120;
const DAY_MS = 24 * 60 * MINUTE_MS;
const BROADCAST = /<!(channel|here|everyone)>/;
const GROUP = /<!subteam\^([A-Z0-9]+)/g;

/** Slack's "New message" composer on a message the agent drafted: where it goes, what it says, and when. */
export function SlackPostBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.message">) {
	const { t } = useLingui();
	const { target, recipients, compose, timezone } = view;
	const [reply, setReply] = useState<SlackReply | null>(null);
	const [postAt, setPostAt] = useState<number | null>(() =>
		view.postAt ? Date.parse(view.postAt) : null,
	);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const retarget = action("retarget");
	const canRetarget = Boolean(retarget) && !retarget?.disabled && !pending;
	const toPeople = target?.kind === "dm" || target?.kind === "group";
	const chosen = useMemo(
		() => new Set(toPeople ? recipients.map((person) => person.id) : []),
		[toPeople, recipients],
	);
	const pickable = compose.members.filter((person) => !chosen.has(person.id));

	const now = Date.now();
	const tooSoon = postAt !== null && postAt < now + MINUTE_MS;
	const tooFar = postAt !== null && postAt > now + SCHEDULE_DAYS_MAX * DAY_MS;
	const when = postAt === null ? null : slackWhen(postAt, timezone);
	const where = target ? (toPeople ? target.name : `#${target.name}`) : "";
	const written = reply
		? `${reply.text}${JSON.stringify(reply.blocks ?? [])}`
		: "";
	const broadcast = BROADCAST.test(written);
	const groups = [
		...new Set([...written.matchAll(GROUP)].map((match) => match[1] ?? "")),
	];
	const notifies = view.notifies;
	const groupNotifies = groups.reduce(
		(sum, id) => sum + (view.groupSizes[id] ?? 0),
		0,
	);
	const groupNames = formatList(
		groups.map((id) => `@${compose.groups[id] ?? id}`),
	);
	const confirmText =
		broadcast || groups.length > 0
			? [
					when
						? t({ message: `Schedule this for ${where} on ${when}?` })
						: t({ message: `Send this to ${where}?` }),
					broadcast &&
						(notifies === null
							? t({ message: "It notifies everyone there." })
							: t({
									message: plural(notifies, {
										one: "It notifies # person there.",
										other: "It notifies # people there.",
									}),
								})),
					groups.length > 0 &&
						t({
							message: plural(groupNotifies, {
								one: `It notifies # person in ${groupNames}.`,
								other: `It notifies # people in ${groupNames}.`,
							}),
						}),
				]
					.filter(Boolean)
					.join(" ")
			: undefined;

	return (
		<SlackWorkspaceProvider
			people={compose.members}
			names={compose.names}
			channels={compose.channels}
			groups={compose.groups}
			emoji={compose.emoji}
		>
			<div className="flex flex-col">
				<div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
					<span className="shrink-0 text-muted-foreground">
						<Trans>To:</Trans>
					</span>
					<SlackPostTarget
						target={target}
						recipients={recipients}
						disabled={!canRetarget}
						onRemove={
							done || !retarget
								? undefined
								: (id) =>
										onAct("retarget", {
											to: recipients
												.map((person) => person.id)
												.filter((each) => each !== id),
										})
						}
					/>
					{!done && retarget && (
						<SlackPicker
							label={t({ message: "Find a channel or person" })}
							align="end"
							channels={view.destinations}
							people={pickable}
							onPickChannel={(channel) => onAct("retarget", { to: channel.id })}
							onPickPerson={(person) =>
								onAct("retarget", {
									to:
										toPeople && chosen.size < GROUP_MAX
											? [...chosen, person.id]
											: [person.id],
								})
							}
						>
							<button
								type="button"
								disabled={!canRetarget}
								className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-fill-hover disabled:opacity-50"
							>
								<Trans context="change where a Slack message goes">
									Change
								</Trans>
							</button>
						</SlackPicker>
					)}
				</div>
				{done ? (
					view.draft && (
						<div className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
							<Mrkdwn text={view.draft} />
						</div>
					)
				) : (
					<div className="pt-3">
						<SlackComposer
							placeholder={
								target
									? t({ message: `Message ${where}` })
									: t({ message: "Write a message" })
							}
							draft={view.draft}
							members={compose.members}
							emoji={compose.emoji}
							channels={compose.channels}
							pending={pending}
							failure={null}
							onChange={setReply}
							notifyGroups={compose.groups}
						/>
					</div>
				)}
				{!done && postAt !== null && (
					<div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-[13px] text-foreground">
						<LuClock className="size-3.5 shrink-0 text-muted-foreground" />
						<Trans>Send on</Trans>
						<SlackDateTime
							value={postAt}
							timeZone={timezone}
							onChange={setPostAt}
							dateLabel={t({ message: "Send date" })}
							timeLabel={t({ message: "Send time" })}
							disabled={pending}
							invalid={tooSoon || tooFar}
						/>
						{(tooSoon || tooFar) && (
							<p className="w-full text-xs text-destructive">
								{tooSoon ? (
									<Trans>Pick a time in the future</Trans>
								) : (
									<Trans>Slack schedules messages up to 120 days ahead</Trans>
								)}
							</p>
						)}
					</div>
				)}
				{!done && view.stale && postAt === null && (
					<p className="px-4 pb-3 text-xs text-muted-foreground">
						<Trans>The proposed time has passed</Trans>
					</p>
				)}
				{failure && (
					<p role="alert" className="px-4 pb-3 text-xs text-destructive">
						{failure}
					</p>
				)}
				{!done && (
					<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
						<ActionButton
							action={action("dismiss")}
							pending={pending}
							variant="outline"
							onClick={() => onAct("dismiss")}
						>
							<Trans>Do not send</Trans>
						</ActionButton>
						<span className="inline-flex">
							<ActionButton
								action={action("send")}
								pending={pending}
								disabled={!reply || !target || tooSoon || tooFar}
								confirmText={confirmText}
								className="rounded-r-none"
								onClick={() =>
									reply &&
									target &&
									onAct("send", {
										text: reply.text,
										blocks: reply.blocks,
										to: target.id,
										postAt:
											postAt === null ? null : new Date(postAt).toISOString(),
										...(broadcast ? { notifies } : {}),
										...(groups.length > 0 ? { groupNotifies } : {}),
									})
								}
							>
								{when ? (
									<Trans>Schedule for {when}</Trans>
								) : (
									<Trans>Send</Trans>
								)}
							</ActionButton>
							{action("send") && (
								<ScheduleMenu
									timeZone={timezone}
									scheduled={postAt !== null}
									disabled={pending || Boolean(action("send")?.disabled)}
									onPick={setPostAt}
								/>
							)}
						</span>
					</div>
				)}
			</div>
		</SlackWorkspaceProvider>
	);
}

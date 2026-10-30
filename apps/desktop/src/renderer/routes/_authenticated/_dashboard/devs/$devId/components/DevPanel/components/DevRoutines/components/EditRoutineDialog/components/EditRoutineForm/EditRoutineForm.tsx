import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { DialogHeader, DialogTitle } from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { Routine } from "../../../../types";
import {
	formFromSchedule,
	type ScheduleForm,
	scheduleFromForm,
} from "../../../../utils/scheduleForm";
import { zoneName } from "../../../../utils/zoneLabels";
import { ScheduleFields } from "./components/ScheduleFields";
import { SettingRow } from "./components/SettingRow";
import { WatchRows } from "./components/WatchRows";

const TIME_ZONES = Intl.supportedValuesOf("timeZone");
const DM_ROOM = "dm";
const THREAD_ROOM = "thread";

const cityOf = (zone: string) =>
	(zone.split("/").pop() ?? zone).replace(/_/g, " ");

interface EditRoutineFormProps {
	devId: string;
	routine: Routine;
	onDone: () => void;
}

/** Mounts with each opening, so a refetch behind the dialog never resets an edit. */
export function EditRoutineForm({
	devId,
	routine,
	onDone,
}: EditRoutineFormProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const [title, setTitle] = useState(routine.title);
	const [prompt, setPrompt] = useState(routine.prompt);
	const [form, setForm] = useState<ScheduleForm | null>(() =>
		routine.schedule
			? formFromSchedule(routine.schedule, {
					now: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})
			: null,
	);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const currentRoom =
		routine.room.kind === "dm"
			? DM_ROOM
			: routine.room.inThread
				? THREAD_ROOM
				: routine.room.channelId;
	const [room, setRoom] = useState(currentRoom);
	const { data: dev } = cloudTrpc.agent.get.useQuery({ agentId: devId });
	const [saved] = useState(() =>
		JSON.stringify([title, prompt, form && scheduleFromForm(form), room]),
	);
	const changed =
		JSON.stringify([title, prompt, form && scheduleFromForm(form), room]) !==
		saved;
	const update = cloudTrpc.agentRoutine.update.useMutation({
		onSuccess: () => {
			void utils.agentRoutine.list.invalidate({ agentId: devId });
			onDone();
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the routine" })),
			),
	});
	const save = () =>
		update.mutate({
			routineId: routine.id,
			title,
			prompt,
			...(form ? { schedule: scheduleFromForm(form) } : {}),
			...(room === currentRoom
				? {}
				: {
						room:
							room === DM_ROOM
								? { kind: "dm" as const }
								: { kind: "channel" as const, channelId: room },
					}),
		});
	const roomChoices = [
		{ value: DM_ROOM, label: t({ message: "Direct messages" }) },
		...(routine.room.inThread
			? [
					{
						value: THREAD_ROOM,
						label: t({ message: `A thread in #${routine.room.name}` }),
					},
				]
			: []),
		...(dev?.channels ?? []).map((channel) => ({
			value: channel.id,
			label: `#${channel.name}`,
		})),
		...(routine.room.kind === "channel" &&
		!routine.room.inThread &&
		!dev?.channels.some((channel) => channel.id === routine.room.channelId)
			? [{ value: routine.room.channelId, label: `#${routine.room.name}` }]
			: []),
	];
	return (
		<div className="flex flex-col gap-3">
			<DialogHeader>
				<DialogTitle>
					<Trans>Edit routine</Trans>
				</DialogTitle>
			</DialogHeader>
			<Input
				aria-label={t({ message: "Title" })}
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				maxLength={120}
			/>
			<Textarea
				aria-label={t({ message: "What it does" })}
				value={prompt}
				onChange={(event) => setPrompt(event.target.value)}
				className="min-h-24"
				maxLength={4000}
			/>
			{form ? (
				<ScheduleFields
					form={form}
					onChange={(patch) => setForm({ ...form, ...patch })}
				/>
			) : (
				<WatchRows watching={routine.watching} />
			)}
			<button
				type="button"
				onClick={() => setShowAdvanced(!showAdvanced)}
				className="flex w-fit items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<Trans>Advanced</Trans>
				{showAdvanced ? (
					<LuChevronUp className="size-3.5" />
				) : (
					<LuChevronDown className="size-3.5" />
				)}
			</button>
			{showAdvanced && (
				<div className="flex flex-col gap-3">
					{form && (
						<div className="rounded-md border border-input">
							<SettingRow label={<Trans>Time zone</Trans>}>
								<Select
									value={form.timezone}
									onValueChange={(timezone) => setForm({ ...form, timezone })}
								>
									<SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-1 text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent">
										<span>{zoneName(form.timezone)}</span>
									</SelectTrigger>
									<SelectContent align="end" className="max-h-72">
										{TIME_ZONES.map((zone) => (
											<SelectItem key={zone} value={zone}>
												{zoneName(zone)} ({cityOf(zone)})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</SettingRow>
						</div>
					)}
					<div className="rounded-md border border-input">
						<SettingRow label={<Trans>Runs in</Trans>}>
							<Select value={room} onValueChange={setRoom}>
								<SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-1 text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent">
									<span>
										{roomChoices.find((choice) => choice.value === room)?.label}
									</span>
								</SelectTrigger>
								<SelectContent align="end" className="max-h-72">
									{roomChoices.map((choice) => (
										<SelectItem key={choice.value} value={choice.value}>
											{choice.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>
					</div>
				</div>
			)}
			<div className="flex justify-end gap-2 pt-1">
				<Button
					variant="outline"
					disabled={update.isPending}
					onClick={() =>
						update.mutate({ routineId: routine.id, enabled: !routine.enabled })
					}
				>
					{routine.enabled ? <Trans>Pause</Trans> : <Trans>Resume</Trans>}
				</Button>
				<Button
					disabled={
						update.isPending || !changed || !title.trim() || !prompt.trim()
					}
					onClick={save}
				>
					<Trans>Save</Trans>
				</Button>
			</div>
		</div>
	);
}

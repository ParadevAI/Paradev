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
	SelectValue,
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
import { ScheduleFields } from "./components/ScheduleFields";
import { SettingRow } from "./components/SettingRow";
import { WatchRows } from "./components/WatchRows";

const TIME_ZONES = Intl.supportedValuesOf("timeZone");

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
		});
	const runsIn =
		routine.room.kind === "dm"
			? t({ message: "Direct messages" })
			: routine.room.inThread
				? t({ message: `A thread in #${routine.room.name}` })
				: `#${routine.room.name}`;
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
				<div className="flex flex-col rounded-md border border-input">
					{form && (
						<SettingRow label={<Trans>Time zone</Trans>}>
							<Select
								value={form.timezone}
								onValueChange={(timezone) => setForm({ ...form, timezone })}
							>
								<SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-1 text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent">
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="end" className="max-h-72">
									{TIME_ZONES.map((zone) => (
										<SelectItem key={zone} value={zone}>
											{zone}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingRow>
					)}
					<SettingRow label={<Trans>Runs in</Trans>}>{runsIn}</SettingRow>
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
					disabled={update.isPending || !title.trim() || !prompt.trim()}
					onClick={save}
				>
					<Trans>Save</Trans>
				</Button>
			</div>
		</div>
	);
}

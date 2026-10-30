import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import {
	LuBell,
	LuCirclePause,
	LuCirclePlay,
	LuClock,
	LuEllipsis,
	LuHash,
	LuPencil,
	LuRotateCw,
	LuTrash2,
} from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { PanelRow } from "../../../PanelRow";
import type { Routine } from "../../types";
import { routineSummary } from "./utils/routineSummary";

interface RoutineRowProps {
	devId: string;
	routine: Routine;
	onEdit: () => void;
}

export function RoutineRow({ devId, routine, onEdit }: RoutineRowProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const [isDeleting, setDeleting] = useState(false);
	const options = {
		onSuccess: () =>
			void utils.agentRoutine.list.invalidate({ agentId: devId }),
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't change the routine" })),
			),
	};
	const update = cloudTrpc.agentRoutine.update.useMutation(options);
	const remove = cloudTrpc.agentRoutine.delete.useMutation(options);
	const runNow = cloudTrpc.agentRoutine.runNow.useMutation(options);
	const icon = routine.schedule ? (
		<LuClock className="size-3.5" />
	) : routine.watching[0]?.kind === "channel" ? (
		<LuHash className="size-3.5" />
	) : (
		<LuBell className="size-3.5" />
	);
	return (
		<>
			<PanelRow
				role="button"
				tabIndex={0}
				onClick={onEdit}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") onEdit();
				}}
				className="cursor-pointer"
				icon={icon}
				label={routine.title}
				trailing={
					<>
						<span className="group-hover:hidden group-focus-within:hidden group-has-[[data-state=open]]:hidden">
							{routineSummary(routine, {
								paused: t({ message: "Paused" }),
								monitoring: t({ message: "Monitoring" }),
							})}
						</span>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label={t({ message: "Routine options" })}
									onClick={(event) => event.stopPropagation()}
									className="hidden size-6 items-center justify-center rounded-md hover:bg-fill-hover hover:text-foreground group-hover:flex group-focus-within:flex data-[state=open]:flex"
								>
									<LuEllipsis className="size-4" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-44"
								onClick={(event) => event.stopPropagation()}
							>
								<DropdownMenuItem
									onSelect={() =>
										update.mutate({
											routineId: routine.id,
											enabled: !routine.enabled,
										})
									}
								>
									{routine.enabled ? (
										<>
											<LuCirclePause className="size-4" />
											<Trans>Pause</Trans>
										</>
									) : (
										<>
											<LuCirclePlay className="size-4" />
											<Trans>Resume</Trans>
										</>
									)}
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => runNow.mutate({ routineId: routine.id })}
								>
									<LuRotateCw className="size-4" />
									<Trans>Run now</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={onEdit}>
									<LuPencil className="size-4" />
									<Trans>Edit</Trans>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => setDeleting(true)}
								>
									<LuTrash2 className="size-4" />
									<Trans>Delete</Trans>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</>
				}
			/>
			<DiscardConfirmDialog
				open={isDeleting}
				onOpenChange={setDeleting}
				title={t({ message: `Delete ${routine.title}?` })}
				description={t({
					message:
						"This will permanently delete the routine and stop future runs.",
				})}
				confirmLabel={t({ message: "Delete routine" })}
				onConfirm={() => remove.mutate({ routineId: routine.id })}
			/>
		</>
	);
}

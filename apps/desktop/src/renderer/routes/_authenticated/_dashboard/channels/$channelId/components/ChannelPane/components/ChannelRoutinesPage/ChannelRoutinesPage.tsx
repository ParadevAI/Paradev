import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { EditRoutineDialog } from "renderer/routes/_authenticated/_dashboard/devs/$devId/components/DevProfile/components/DevRoutines/components/EditRoutineDialog";
import { RoutineRow } from "renderer/routes/_authenticated/_dashboard/devs/$devId/components/DevProfile/components/DevRoutines/components/RoutineRow";
import { useChannelDevs, useChannelRoutines } from "../../hooks/useChannelDevs";

/** The automations that answer in this channel, across its Devs. */
export function ChannelRoutinesPage({ channelId }: { channelId: string }) {
	const devs = useChannelDevs(channelId);
	const routines = useChannelRoutines(channelId, devs);
	const [editingId, setEditingId] = useState<string | null>(null);
	const editing =
		routines.find((entry) => entry.routine.id === editingId) ?? null;
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-px p-3">
				{routines.length === 0 ? (
					<p className="px-2 py-1 text-[13px] leading-[18px] text-muted-foreground">
						{devs.length === 0 ? (
							<Trans>
								No automations. Add a Dev to this channel and ask it to set one
								up here.
							</Trans>
						) : (
							<Trans>
								No automations answer in this channel yet. Ask the Dev to set
								one up here.
							</Trans>
						)}
					</p>
				) : (
					routines.map(({ dev, routine }) => (
						<RoutineRow
							key={routine.id}
							devId={dev.actorId}
							routine={routine}
							onEdit={() => setEditingId(routine.id)}
						/>
					))
				)}
			</div>
			{editing && (
				<EditRoutineDialog
					devId={editing.dev.actorId}
					routine={editing.routine}
					onClose={() => setEditingId(null)}
				/>
			)}
		</div>
	);
}

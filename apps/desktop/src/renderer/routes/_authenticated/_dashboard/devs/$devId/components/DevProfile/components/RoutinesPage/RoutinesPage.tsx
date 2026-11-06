import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { EditRoutineDialog } from "../DevRoutines/components/EditRoutineDialog";
import { RoutineRow } from "../DevRoutines/components/RoutineRow";

/** What wakes the Dev on its own: each routine, with its schedule or what it watches. */
export function RoutinesPage({ devId }: { devId: string }) {
	const { data: routines } = cloudTrpc.agentRoutine.list.useQuery({
		agentId: devId,
	});
	const [editingId, setEditingId] = useState<string | null>(null);
	const editing = routines?.find((routine) => routine.id === editingId) ?? null;
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-px p-3">
				{!routines?.length ? (
					<p className="px-2 py-1 text-[13px] text-muted-foreground">
						<Trans>No automations yet. Ask the Dev to set one up.</Trans>
					</p>
				) : (
					routines.map((routine) => (
						<RoutineRow
							key={routine.id}
							devId={devId}
							routine={routine}
							onEdit={() => setEditingId(routine.id)}
						/>
					))
				)}
			</div>
			<EditRoutineDialog
				devId={devId}
				routine={editing}
				onClose={() => setEditingId(null)}
			/>
		</div>
	);
}

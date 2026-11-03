import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PanelSection } from "../PanelSection";
import { EditRoutineDialog } from "./components/EditRoutineDialog";
import { RoutineRow } from "./components/RoutineRow";

export function DevRoutines({ devId }: { devId: string }) {
	const { data: routines } = cloudTrpc.agentRoutine.list.useQuery({
		agentId: devId,
	});
	const [editingId, setEditingId] = useState<string | null>(null);
	const editing = routines?.find((routine) => routine.id === editingId) ?? null;
	if (!routines?.length) return null;
	return (
		<>
			<PanelSection title={<Trans>Routines</Trans>}>
				{routines.map((routine) => (
					<RoutineRow
						key={routine.id}
						devId={devId}
						routine={routine}
						onEdit={() => setEditingId(routine.id)}
					/>
				))}
			</PanelSection>
			<EditRoutineDialog
				devId={devId}
				routine={editing}
				onClose={() => setEditingId(null)}
			/>
		</>
	);
}

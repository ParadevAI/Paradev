import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CloudWorkspaceAccessConfirmDialog } from "./components/CloudWorkspaceAccessConfirmDialog";

interface CloudWorkspaceAccessSwitchProps {
	id: string;
	organizationId: string;
	machineId: string;
	allowed: boolean;
}

export function CloudWorkspaceAccessSwitch({
	id,
	organizationId,
	machineId,
	allowed,
}: CloudWorkspaceAccessSwitchProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const setAccess = cloudTrpc.host.setCloudWorkspaceAccess.useMutation({
		onSettled: () => utils.host.roster.invalidate(),
	});
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState(false);

	const runToggle = (next: boolean) => {
		toast.promise(
			setAccess.mutateAsync({ organizationId, machineId, allowed: next }),
			{
				loading: t({ message: "Saving…" }),
				success: () => t({ message: "Setting saved" }),
				error: (err: unknown) =>
					errorMessage(err, t({ message: "Failed to update setting" })),
			},
		);
	};

	return (
		<>
			<Switch
				id={id}
				checked={allowed}
				onCheckedChange={(next) => {
					setConfirmTarget(next);
					setConfirmOpen(true);
				}}
				disabled={setAccess.isPending}
			/>
			<CloudWorkspaceAccessConfirmDialog
				open={confirmOpen}
				targetEnabled={confirmTarget}
				onOpenChange={setConfirmOpen}
				onConfirm={() => {
					setConfirmOpen(false);
					runToggle(confirmTarget);
				}}
			/>
		</>
	);
}

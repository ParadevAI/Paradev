import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuArrowUpRight, LuPlus } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AddSecretSheet } from "renderer/routes/_authenticated/components/AddSecretSheet";
import { EditSecretDialog } from "renderer/routes/_authenticated/components/EditSecretDialog";
import { SecretRow } from "renderer/routes/_authenticated/components/SecretRow";

const PREVIEW_COUNT = 5;

interface EnvironmentVariablesPreviewProps {
	environmentId: string;
}

/** The most recently changed variables, with the full list and adding one a click away. */
export function EnvironmentVariablesPreview({
	environmentId,
}: EnvironmentVariablesPreviewProps) {
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState<{
		id: string;
		key: string;
		value: string;
		sensitive: boolean;
	} | null>(null);
	const variables = cloudTrpc.environment.secrets.getDecrypted.useQuery({
		environmentId,
	});
	const refresh = () => void utils.environment.secrets.invalidate();
	const recent = useMemo(
		() =>
			[...(variables.data ?? [])]
				.sort(
					(a, b) =>
						new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
				)
				.slice(0, PREVIEW_COUNT),
		[variables.data],
	);
	const total = variables.data?.length ?? 0;

	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-base font-semibold">
						<Trans>Environment variables</Trans>
					</h3>
					<p className="mt-0.5 text-xs text-muted-foreground">
						<Trans>
							The most recently changed. Set on every workspace started from
							this environment, and while it builds.
						</Trans>
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{total > 0 && (
						<Button
							className="h-8 gap-1.5 px-3 text-muted-foreground hover:text-foreground"
							onClick={() =>
								navigate({
									to: "/environments/$environmentId/variables",
									params: { environmentId },
								})
							}
							size="sm"
							variant="ghost"
						>
							<Trans>All environment variables ({total})</Trans>
							<LuArrowUpRight className="size-3.5" />
						</Button>
					)}
					<Button
						className="h-8"
						onClick={() => setAdding(true)}
						size="sm"
						variant="outline"
					>
						<LuPlus className="size-3.5" />
						<Trans>Add variable</Trans>
					</Button>
				</div>
			</div>
			{variables.isLoading ? (
				<Skeleton className="h-24 w-full" />
			) : recent.length === 0 ? (
				<p className="rounded-md border px-3 py-3 text-xs text-muted-foreground">
					<Trans>No variables set yet.</Trans>
				</p>
			) : (
				<div className="rounded-md border">
					{recent.map((variable) => (
						<SecretRow
							environmentId={environmentId}
							key={variable.id}
							onDeleted={refresh}
							onEdit={() => setEditing(variable)}
							secret={variable}
						/>
					))}
				</div>
			)}
			<AddSecretSheet
				environmentId={environmentId}
				onOpenChange={setAdding}
				onSaved={refresh}
				open={adding}
			/>
			{editing && (
				<EditSecretDialog
					environmentId={environmentId}
					onOpenChange={(open) => {
						if (!open) setEditing(null);
					}}
					onSaved={refresh}
					open
					secret={editing}
				/>
			)}
		</section>
	);
}

import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { DetailRow } from "renderer/routes/_authenticated/_dashboard/components/DetailRow";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useUpdateDev } from "../../hooks/useUpdateDev";

type Dev = RouterOutputs["agent"]["get"];

export function AboutTab({
	dev,
	onCustomize,
}: {
	dev: Dev;
	onCustomize: () => void;
}) {
	const update = useUpdateDev();
	const manage = dev.canManage;
	const created = formatDate(new Date(dev.createdAt), {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
	return (
		<div className="flex flex-col gap-4">
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
				<DetailRow
					label={<Trans>Name</Trans>}
					value={dev.name}
					editValue={dev.name}
					maxLength={80}
					onSave={
						manage
							? (name) => {
									if (name.trim())
										update.mutate({ agentId: dev.id, name: name.trim() });
								}
							: undefined
					}
				/>
				<DetailRow
					label={<Trans>Look</Trans>}
					value={<DevAvatar avatar={dev.avatar} size={32} alive />}
					onEdit={manage ? onCustomize : undefined}
				/>
			</div>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
				<DetailRow
					label={<Trans>What it does</Trans>}
					value={
						dev.description || (
							<span className="text-muted-foreground">
								<Trans>None yet</Trans>
							</span>
						)
					}
					editValue={dev.description ?? ""}
					maxLength={500}
					onSave={
						manage
							? (description) =>
									update.mutate({
										agentId: dev.id,
										description: description.trim() || null,
									})
							: undefined
					}
				/>
				<DetailRow label={<Trans>Created</Trans>} value={created} />
			</div>
		</div>
	);
}

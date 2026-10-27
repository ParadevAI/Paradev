import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { LuHash, LuLock } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useUpdateDev } from "../../hooks/useUpdateDev";

type Dev = RouterOutputs["agent"]["get"];
type MessageAccess = Dev["messageAccess"];

export function AccessTab({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const organizationId = useActiveOrganizationId();
	const update = useUpdateDev();
	const { data: channels = [] } = cloudTrpc.channel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const options = {
		onSuccess: () => void utils.agent.get.invalidate({ agentId: dev.id }),
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	};
	const grant = cloudTrpc.agent.grantChannel.useMutation(options);
	const revoke = cloudTrpc.agent.revokeChannel.useMutation(options);
	const granted = new Set(dev.channels.map((channel) => channel.id));
	return (
		<div className="flex flex-col gap-4">
			<div className="overflow-hidden rounded-lg border border-border bg-background">
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<span className="text-sm font-semibold">
						<Trans>Who can message it</Trans>
					</span>
					<Select
						value={dev.messageAccess}
						onValueChange={(value) =>
							update.mutate({
								agentId: dev.id,
								messageAccess: value as MessageAccess,
							})
						}
					>
						<SelectTrigger className="h-8 w-64">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="organization">
								{t({ message: "Anyone in your organization" })}
							</SelectItem>
							<SelectItem value="creator">
								{t({ message: "Only its creator" })}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
				<div className="px-4 py-3 text-sm font-semibold">
					<Trans>Channels it can read and post in</Trans>
				</div>
				{channels.map((channel) => {
					const Icon = channel.visibility === "private" ? LuLock : LuHash;
					return (
						<div
							key={channel.id}
							className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
						>
							<span className="flex min-w-0 items-center gap-2">
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate">{channel.name}</span>
							</span>
							<Switch
								checked={granted.has(channel.id)}
								onCheckedChange={(next) =>
									(next ? grant : revoke).mutate({
										agentId: dev.id,
										channelId: channel.id,
									})
								}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

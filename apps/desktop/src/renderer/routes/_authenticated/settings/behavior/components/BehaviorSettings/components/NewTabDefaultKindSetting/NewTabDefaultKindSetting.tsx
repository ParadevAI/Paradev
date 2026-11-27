import { Trans, useLingui } from "@lingui/react/macro";
import { NEW_TAB_DEFAULT_KINDS } from "@superset/local-db/schema/zod";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";

export function NewTabDefaultKindSetting({
	searchQuery,
}: {
	searchQuery: string;
}) {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const { data: kind = "ask", isLoading } =
		electronTrpc.settings.getNewTabDefaultKind.useQuery();
	const setKind = electronTrpc.settings.setNewTabDefaultKind.useMutation({
		onSuccess: () => utils.settings.getNewTabDefaultKind.invalidate(),
	});

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="space-y-0.5">
				<Label htmlFor="new-tab-default-kind" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Default new tab" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>Choose what opens when you click + in the tab bar.</Trans>
				</p>
			</div>
			<Select
				value={kind}
				disabled={isLoading || setKind.isPending}
				onValueChange={(value) => {
					const nextKind = NEW_TAB_DEFAULT_KINDS.find((kind) => kind === value);
					if (nextKind) setKind.mutate({ kind: nextKind });
				}}
			>
				<SelectTrigger id="new-tab-default-kind" className="w-[180px] shrink-0">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="ask">
						<Trans>Ask</Trans>
					</SelectItem>
					<SelectItem value="terminal">
						<Trans>Terminal</Trans>
					</SelectItem>
					<SelectItem value="chat">
						<Trans>Chat</Trans>
					</SelectItem>
					<SelectItem value="browser">
						<Trans>Browser</Trans>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}

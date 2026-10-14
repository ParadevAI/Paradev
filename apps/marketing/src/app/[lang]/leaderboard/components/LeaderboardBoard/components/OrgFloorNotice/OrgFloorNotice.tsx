import { Trans } from "@lingui/react/macro";

interface OrgFloorNoticeProps {
	members: number;
	minMembers: number;
}

export function OrgFloorNotice({ members, minMembers }: OrgFloorNoticeProps) {
	return (
		<div className="border border-border p-12 text-center">
			<p className="text-sm text-muted-foreground">
				<Trans>
					This board opens once {minMembers} members have usage in this period.{" "}
					{members} so far.
				</Trans>
			</p>
			<p className="text-xs text-muted-foreground mt-2">
				<Trans>
					Members appear here after turning on "Show me on my organizations'
					boards" in Superset under Settings → Account.
				</Trans>
			</p>
		</div>
	);
}

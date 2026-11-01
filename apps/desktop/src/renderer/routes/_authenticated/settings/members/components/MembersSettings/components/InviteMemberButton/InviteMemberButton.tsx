import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { HiOutlinePlus } from "react-icons/hi2";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";
import { useSeatCap } from "../../../../hooks/useSeatCap";

export function InviteMemberButton() {
	const invite = useInviteMember();
	const { limit, atLimit } = useSeatCap();

	if (!invite) {
		return null;
	}

	return (
		<div className="flex items-center gap-3">
			{atLimit && (
				<span className="text-xs text-muted-foreground">
					<Trans>Your plan allows {limit} members.</Trans>{" "}
					<Link
						to="/settings/billing/plans"
						className="font-medium text-foreground underline underline-offset-4"
					>
						<Trans>Upgrade to Team</Trans>
					</Link>
				</span>
			)}
			<Button size="sm" onClick={invite} disabled={atLimit} className="gap-1.5">
				<HiOutlinePlus className="h-3.5 w-3.5" />
				<Trans>Invite member</Trans>
			</Button>
		</div>
	);
}

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";
import { LuCircleHelp } from "react-icons/lu";
import { useSignOut } from "renderer/hooks/useSignOut";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function OnboardingHelpLinks() {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const signOut = useSignOut();

	return (
		<div className="no-drag flex items-center gap-1">
			<Button
				size="sm"
				variant="ghost"
				className="text-muted-foreground"
				onClick={() => openUrl.mutate(COMPANY.REPORT_ISSUE_URL)}
			>
				<LuCircleHelp />
				<Trans>Get support</Trans>
			</Button>
			<Button
				size="sm"
				variant="ghost"
				className="text-muted-foreground"
				onClick={async () => {
					await signOut();
				}}
			>
				<HiOutlineArrowRightOnRectangle />
				<Trans>Sign out</Trans>
			</Button>
		</div>
	);
}

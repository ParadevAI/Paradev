import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { CloudUsageBanner } from "../CloudUsageBanner";

export function CloudWorkspaceNotStartedBanner({ error }: { error: unknown }) {
	const { t } = useLingui();
	const { wakeOpenWorkspace } = useSandboxAccess();
	return (
		<CloudUsageBanner
			tone="destructive"
			message={errorMessage(error)}
			actions={
				<Button
					size="sm"
					variant="ghost"
					onClick={() => wakeOpenWorkspace().catch(() => {})}
				>
					{t({ message: "Try again" })}
				</Button>
			}
		/>
	);
}

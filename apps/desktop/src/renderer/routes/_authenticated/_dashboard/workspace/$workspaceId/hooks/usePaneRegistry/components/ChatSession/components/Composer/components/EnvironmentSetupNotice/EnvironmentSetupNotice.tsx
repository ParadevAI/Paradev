import { cn } from "@superset/ui/utils";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";
import { SetUpEnvironmentButton } from "renderer/routes/_authenticated/components/SetUpEnvironmentButton";
import {
	ENVIRONMENT_SETUP_PROMPT,
	withEnvironmentSetupSkill,
} from "renderer/routes/_authenticated/utils/environmentSetupPrompt";

/** Offered to an environment's creator until it has a checkpoint ("image" means it never had one). */
export function EnvironmentSetupNotice({
	className,
	workspaceId,
	onSetUp,
}: {
	className?: string;
	workspaceId: string;
	onSetUp: (prompt: string) => void;
}) {
	const { data: session } = authClient.useSession();
	const environment = useWorkspaceEnvironment(workspaceId);
	if (
		environment?.sourceKind !== "image" ||
		!session?.user?.id ||
		environment.createdByUserId !== session.user.id
	) {
		return null;
	}
	const environmentUrl = new URL(
		`/environments/${environment.id}`,
		env.NEXT_PUBLIC_WEB_URL,
	).toString();
	return (
		<div className={cn("mb-1.5 flex", className)}>
			<SetUpEnvironmentButton
				onClick={() =>
					onSetUp(
						withEnvironmentSetupSkill(ENVIRONMENT_SETUP_PROMPT, environmentUrl),
					)
				}
			/>
		</div>
	);
}

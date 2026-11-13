import { Trans } from "@lingui/react/macro";

export function SetupAgentNote() {
	return (
		<p className="px-5 pb-4 text-xs leading-snug text-muted-foreground">
			<Trans>
				An agent sets up this environment in a cloud workspace (about 20 minutes
				or more): it installs dependencies, writes the setup config and asks for
				any secrets it needs. Interrupt it at any time, or take over in the
				workspace to finish setup yourself.
			</Trans>
		</p>
	);
}

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";

const GUIDE_URL = `${COMPANY.DOCS_URL}/plugins/build-a-plugin`;

export function SubmitPluginActions() {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<a
				href={`${GUIDE_URL}#submit-to-the-paradev-marketplace`}
				className="bg-foreground px-5 py-2.5 text-background text-sm transition-opacity hover:opacity-90"
			>
				<Trans>Submit your plugin</Trans>
			</a>
			<a
				href={GUIDE_URL}
				className="border border-border px-5 py-2.5 text-foreground text-sm transition-colors hover:bg-muted"
			>
				<Trans>Read the guide</Trans>
			</a>
		</div>
	);
}

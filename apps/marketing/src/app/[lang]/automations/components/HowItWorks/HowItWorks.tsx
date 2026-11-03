import { Trans } from "@lingui/react/macro";
import { TriggerSources } from "./components/TriggerSources";

export function HowItWorks() {
	return (
		<div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-14">
			<p className="text-lg text-muted-foreground leading-relaxed">
				<Trans>
					When a trigger fires, the Mac you picked opens a new workspace and the
					agent starts on your prompt. Event runs include the event, so the
					agent knows what to look at. Reply to the run to keep going.
				</Trans>
			</p>
			<TriggerSources />
		</div>
	);
}

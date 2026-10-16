import { Trans, useLingui } from "@lingui/react/macro";
import type {
	RoutedDestinationView,
	SlackComposeContextView,
} from "../../../../types";
import { GmailDraftForm } from "../../../GmailEmailBlock";
import { LinearDraftEditor } from "../../../LinearDraftEditor";
import { SlackComposer } from "../../../SlackComposer";
import { SlackPostTarget } from "../../../SlackPostTarget";
import type { RoutedPayload } from "../../utils/routedValue";

interface DestinationEditorProps {
	destination: RoutedDestinationView;
	payload: RoutedPayload;
	compose: SlackComposeContextView | null;
	disabled?: boolean;
	onChange: (next: RoutedPayload) => void;
}

const NO_NAMES = {};

/** What a row sends, in its destination's own editor: Gmail's compose window, a Linear draft, or Slack's message box under its "To:" line. */
export function DestinationEditor({
	destination,
	payload,
	compose,
	disabled,
	onChange,
}: DestinationEditorProps) {
	const { t } = useLingui();
	if (destination.kind === "gmail" && payload.kind === "gmail")
		return (
			<GmailDraftForm
				value={payload}
				from={destination.from}
				disabled={disabled}
				onChange={(next) => onChange({ kind: "gmail", ...next })}
			/>
		);
	if (destination.kind === "linear" && payload.kind === "linear")
		return (
			<div className="rounded-lg border border-border p-3">
				<LinearDraftEditor
					draft={destination.draft}
					value={payload.draft}
					disabled={disabled}
					onChange={(draft) => onChange({ kind: "linear", draft })}
				/>
			</div>
		);
	if (destination.kind !== "slack") return null;
	return (
		<div className="overflow-hidden rounded-lg border border-border">
			<div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
				<span className="shrink-0 text-muted-foreground">
					<Trans>To:</Trans>
				</span>
				<SlackPostTarget
					target={destination.target}
					recipients={destination.recipients}
				/>
			</div>
			<div className="pt-3">
				<SlackComposer
					placeholder={t({ message: "Write a message" })}
					draft={destination.text}
					members={compose?.members ?? []}
					emoji={compose?.emoji ?? NO_NAMES}
					channels={compose?.channels ?? NO_NAMES}
					pending={Boolean(disabled)}
					failure={null}
					onChange={(reply) => onChange({ kind: "slack", reply })}
				/>
			</div>
		</div>
	);
}

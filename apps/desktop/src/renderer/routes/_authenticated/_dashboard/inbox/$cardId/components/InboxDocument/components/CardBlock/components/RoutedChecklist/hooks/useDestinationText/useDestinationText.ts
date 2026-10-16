import { useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import type {
	RoutedDestinationView,
	SlackConversationView,
} from "../../../../types";
import type { RoutedPayload } from "../../utils/routedValue";

const slackWhere = (target: SlackConversationView) =>
	target.kind === "channel" || target.kind === "private"
		? `#${target.name}`
		: target.name;

/** A destination in words, for the short label its chip shows. */
export function useDestinationText() {
	const { t } = useLingui();
	const recipients = (
		destination: Extract<RoutedDestinationView, { kind: "gmail" }>,
		payload: RoutedPayload | null,
	) => formatList(payload?.kind === "gmail" ? payload.to : destination.to);

	return {
		chip(
			destination: RoutedDestinationView,
			payload: RoutedPayload | null,
		): string {
			if (destination.kind === "gmail") {
				const to = recipients(destination, payload);
				return to
					? t({ message: `Gmail draft to ${to}` })
					: t({ message: "Gmail draft" });
			}
			if (destination.kind === "linear") {
				const team = destination.draft.team.name;
				return t({ message: `Linear issue in ${team}` });
			}
			const where = slackWhere(destination.target);
			return t({ message: `Slack message to ${where}` });
		},
	};
}

import type { CardBlockViewProps } from "../../types";
import { PauseForm } from "./components/PauseForm";
import { StatusForm } from "./components/StatusForm";

/** Slack's "Set a status" dialog or its "Pause notifications" menu, on the reader's own account. */
export function SlackStatusBlock(props: CardBlockViewProps<"slack.status">) {
	return props.view.mode === "pause" ? (
		<PauseForm {...props} />
	) : (
		<StatusForm {...props} />
	);
}

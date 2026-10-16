import type { CardBlockViewProps } from "../../types";
import { ConnectForm } from "./components/ConnectForm";
import { CreateForm } from "./components/CreateForm";
import { InviteForm } from "./components/InviteForm";

/** Slack's own dialogs on a channel change the agent proposes: add people, create a channel, or invite another organization. */
export function SlackChannelBlock(props: CardBlockViewProps<"slack.channel">) {
	const { mode } = props.view;
	if (mode === "create") return <CreateForm {...props} />;
	if (mode === "connect") return <ConnectForm {...props} />;
	return <InviteForm {...props} />;
}

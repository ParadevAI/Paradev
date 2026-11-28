import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { RailDestinationId } from "./stores/railPinsStore";

export const RAIL_DESTINATION_LABELS = {
	workspaces: msg({ message: "Workspaces" }),
	chat: msg({ message: "Chat" }),
	pages: msg({ message: "Pages" }),
	plugins: msg({ message: "Plugins" }),
	automations: msg({ message: "Automations" }),
	tasks: msg({ message: "Tasks" }),
	pullRequests: msg({ message: "Pull requests" }),
} satisfies Record<RailDestinationId, MessageDescriptor>;

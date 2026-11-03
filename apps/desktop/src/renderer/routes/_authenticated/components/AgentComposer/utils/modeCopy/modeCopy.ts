import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	FastForward,
	FilePen,
	type LucideIcon,
	NotebookPen,
	Pause,
	Play,
} from "lucide-react";

export type ModeCopy = {
	title: MessageDescriptor;
	description: MessageDescriptor;
	icon: LucideIcon;
};

const ASK_FOR_APPROVAL: ModeCopy = {
	title: msg({ message: "Ask for approval" }),
	description: msg({ message: "Asks before edits and commands" }),
	icon: Pause,
};

const APPROVE_FOR_ME: ModeCopy = {
	title: msg({ message: "Approve for me" }),
	description: msg({ message: "Asks only for risky actions" }),
	icon: Play,
};

const FULL_ACCESS: ModeCopy = {
	title: msg({ message: "Full access" }),
	description: msg({ message: "Never asks before acting" }),
	icon: FastForward,
};

export const KNOWN_MODES: Readonly<Record<string, ModeCopy>> = {
	default: ASK_FOR_APPROVAL,
	"read-only": ASK_FOR_APPROVAL,
	acceptEdits: {
		title: msg({ message: "Approve edits" }),
		description: msg({
			message: "Edit files without asking; ask before commands",
		}),
		icon: FilePen,
	},
	plan: {
		title: msg({ message: "Plan" }),
		description: msg({ message: "Read and plan without changing anything" }),
		icon: NotebookPen,
	},
	auto: APPROVE_FOR_ME,
	agent: APPROVE_FOR_ME,
	bypassPermissions: FULL_ACCESS,
	"full-access": FULL_ACCESS,
	"agent-full-access": FULL_ACCESS,
};

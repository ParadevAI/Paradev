import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ComposerActionContext } from "@superset/chat-ui/PromptInput";
import {
	Brain,
	CalendarClock,
	History,
	Info,
	type LucideIcon,
	MessageSquarePlus,
	NotebookPen,
	Paperclip,
	Search,
	ServerIcon,
	Split,
	Undo2,
	Zap,
} from "lucide-react";
import type { ChatForkTarget } from "../../../../types";
import { FORK_TARGET_ARGS, parseForkTarget, parseSwitch } from "../commandArgs";

/** What the chat can do right now; a missing action hides its commands. */
export type AppCommandContext = {
	newChat?: () => void;
	openModelPicker?: () => void;
	fast?: { on: boolean; set: (on: boolean) => void };
	plan?: { active: boolean; enter: () => void; leave: () => void };
	fork?: {
		targets: readonly ChatForkTarget[];
		run: (target: ChatForkTarget) => void;
	};
	openHistory?: () => void;
	openMcp?: (composer: ComposerActionContext) => void;
	openFind?: () => void;
	openStatus?: () => void;
	createAutomation?: (prompt: string) => void;
};

export type AppCommandOutcome = "done" | "bad-args";

export type AppCommandChoice = { arg: string; description: MessageDescriptor };

export type AppCommand = {
	name: string;
	aliases?: readonly string[];
	icon: LucideIcon;
	description: MessageDescriptor;
	hint?: string | MessageDescriptor;
	/** Picking it from the menu leaves it in the composer for the text it takes. */
	takesText?: boolean;
	/** One menu row per choice, each running the command with its argument. */
	choices?: (context: AppCommandContext) => AppCommandChoice[];
	available: (context: AppCommandContext) => boolean;
	/** Whether the menu lists it right now; an unlisted command still runs when typed. */
	listed?: (context: AppCommandContext) => boolean;
	run: (
		context: AppCommandContext,
		args: string,
		composer: ComposerActionContext,
	) => AppCommandOutcome;
};

function withoutArgs(
	args: string,
	action: (() => void) | undefined,
): AppCommandOutcome {
	if (args) return "bad-args";
	action?.();
	return "done";
}

const FORK_TARGET_DESCRIPTIONS: Record<ChatForkTarget, MessageDescriptor> = {
	workspace: msg({ message: "Branch in this workspace" }),
	worktree: msg({ message: "Branch in a new worktree" }),
};

export const APP_COMMANDS: readonly AppCommand[] = [
	{
		name: "new",
		aliases: ["clear", "reset"],
		icon: MessageSquarePlus,
		description: msg({ message: "Start a new chat" }),
		available: (context) => context.newChat !== undefined,
		run: (context, args) => withoutArgs(args, context.newChat),
	},
	{
		name: "model",
		icon: Brain,
		description: msg({ message: "Choose the model" }),
		available: (context) => context.openModelPicker !== undefined,
		run: (context, args) => withoutArgs(args, context.openModelPicker),
	},
	{
		name: "fast",
		icon: Zap,
		description: msg({ message: "Turn Fast mode on or off" }),
		hint: "[on|off]",
		available: (context) => context.fast !== undefined,
		run: (context, args) => {
			const on = context.fast ? parseSwitch(args, context.fast.on) : null;
			if (on === null) return "bad-args";
			context.fast?.set(on);
			return "done";
		},
	},
	{
		name: "plan",
		icon: NotebookPen,
		description: msg({ message: "Read and plan without changing anything" }),
		available: (context) => context.plan !== undefined,
		listed: (context) => context.plan?.active === false,
		run: (context, args) => withoutArgs(args, context.plan?.enter),
	},
	{
		name: "default",
		icon: Undo2,
		description: msg({ message: "Leave plan mode" }),
		available: (context) => context.plan !== undefined,
		listed: (context) => context.plan?.active === true,
		run: (context, args) => withoutArgs(args, context.plan?.leave),
	},
	{
		name: "fork",
		aliases: ["branch"],
		icon: Split,
		description: msg({ message: "Branch this conversation" }),
		hint: "[here|worktree]",
		choices: (context) =>
			(context.fork?.targets ?? []).map((target) => ({
				arg: FORK_TARGET_ARGS[target],
				description: FORK_TARGET_DESCRIPTIONS[target],
			})),
		available: (context) => (context.fork?.targets.length ?? 0) > 0,
		run: (context, args) => {
			const target = context.fork
				? parseForkTarget(args, context.fork.targets)
				: null;
			if (!target) return "bad-args";
			context.fork?.run(target);
			return "done";
		},
	},
	{
		name: "resume",
		aliases: ["continue"],
		icon: History,
		description: msg({ message: "Chat history" }),
		available: (context) => context.openHistory !== undefined,
		run: (context, args) => withoutArgs(args, context.openHistory),
	},
	{
		name: "mcp",
		icon: ServerIcon,
		description: msg({ message: "Choose MCP servers for this message" }),
		available: (context) => context.openMcp !== undefined,
		run: (context, args, composer) =>
			withoutArgs(args, () => context.openMcp?.(composer)),
	},
	{
		name: "status",
		icon: Info,
		description: msg({ message: "Session status" }),
		available: (context) => context.openStatus !== undefined,
		run: (context, args) => withoutArgs(args, context.openStatus),
	},
	{
		name: "find",
		icon: Search,
		description: msg({ message: "Find in this chat" }),
		available: (context) => context.openFind !== undefined,
		run: (context, args) => withoutArgs(args, context.openFind),
	},
	{
		name: "attach",
		icon: Paperclip,
		description: msg({ message: "Attach files" }),
		available: () => true,
		run: (_context, args, composer) => withoutArgs(args, composer.attachFiles),
	},
	{
		name: "automation",
		icon: CalendarClock,
		description: msg({ message: "Create an automation from this prompt" }),
		hint: msg({ message: "[prompt]" }),
		takesText: true,
		available: (context) => context.createAutomation !== undefined,
		run: (context, args) => {
			if (!args) return "bad-args";
			context.createAutomation?.(args);
			return "done";
		},
	},
];

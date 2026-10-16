import { useLingui } from "@lingui/react/macro";
import type {
	SlashCommandName,
	SlashShortcut,
	Unavailable,
} from "../../utils/slashCommands";

/** The words Slack's `/` menu shows, and why a command can't run from here. */
export function useSlashText() {
	const { t } = useLingui();
	const commands: Record<SlashCommandName, { args: string; does: string }> = {
		archive: { args: "", does: t({ message: "Archive the current channel" }) },
		collapse: {
			args: "",
			does: t({
				message: "Collapse all files in the current channel or thread",
			}),
		},
		expand: {
			args: "",
			does: t({ message: "Expand all files in the current channel or thread" }),
		},
		feed: {
			args: t({ message: "help [or subscribe, list, remove…]" }),
			does: t({ message: "Manage RSS subscriptions" }),
		},
		me: {
			args: t({ message: "your message" }),
			does: t({ message: "Displays action text" }),
		},
		open: {
			args: t({ message: "channel" }),
			does: t({ message: "Open a channel" }),
		},
		remind: {
			args: t({ message: "[#channel] [what] [when]" }),
			does: t({ message: "Set a reminder" }),
		},
		remove: {
			args: t({ message: "@user" }),
			does: t({ message: "Remove a person from the current channel" }),
		},
		shrug: {
			args: t({ message: "your text" }),
			does: t({ message: "Appends ¯\\_(ツ)_/¯ to your message" }),
		},
		who: {
			args: "",
			does: t({ message: "List users in the current channel" }),
		},
	};
	const shortcuts: Record<SlashShortcut, string> = {
		invite: t({ message: "Invite someone to this channel" }),
		topic: t({ message: "Edit this channel’s topic" }),
		away: t({ message: "Set yourself as away" }),
	};
	const unavailable: Record<Unavailable, string> = {
		"slack-app": t({ message: "Only works in the Slack app" }),
		thread: t({ message: "Slack can't post this in a thread from here" }),
		permission: t({
			message: "Needs a Slack permission Superset doesn't ask for",
		}),
	};
	return { commands, shortcuts, unavailable };
}

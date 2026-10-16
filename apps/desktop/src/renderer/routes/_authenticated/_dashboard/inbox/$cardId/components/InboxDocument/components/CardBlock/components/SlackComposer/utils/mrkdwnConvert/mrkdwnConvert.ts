const PERSON_PREFIX = "superset://users/";
export const CHANNEL_PREFIX = "superset://slack-channels/";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">" };

/**
 * A Slack-formatted draft to the editor's markdown, so the agent's proposed
 * reply opens in the composer the way it will read when posted. Custom emoji
 * become emoji nodes (the editor parses that span); standard ones stay as
 * shortcodes, which the editor already recognises.
 */
export function mrkdwnToMarkdown(
	mrkdwn: string,
	people: ReadonlyMap<string, string>,
	customEmoji: ReadonlySet<string> = new Set(),
	channels: Readonly<Record<string, string>> = {},
	groups: Readonly<Record<string, string>> = {},
): string {
	return mrkdwn
		.replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id: string) => {
			return `[@${people.get(id) ?? id}](${PERSON_PREFIX}${id})`;
		})
		.replace(
			/<#([A-Z0-9]+)(?:\|([^>]*))?>/g,
			(_, id: string, label?: string) => {
				return `[#${label || channels[id] || id}](${CHANNEL_PREFIX}${id})`;
			},
		)
		.replace(/<!(channel|here|everyone)(?:\|[^>]*)?>/g, "@$1")
		.replace(
			/<!subteam\^([A-Z0-9]+)(?:\|@?([^>]*))?>/g,
			(_, id: string, label?: string) => `@${groups[id] ?? label ?? id}`,
		)
		.replace(/<([^>|@#!]+)\|([^>]*)>/g, "[$2]($1)")
		.replace(/<([^>|@#!]+)>/g, "$1")
		.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1**$2**")
		.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1*$2*")
		.replace(/~([^~\n]+)~/g, "~~$1~~")
		.replace(/^(\s*)•\s+/gm, "$1- ")
		.replace(/&(amp|lt|gt);/g, (_, name: string) => ENTITIES[name])
		.replace(/:([a-z0-9_+-]+):/g, (whole, name: string) =>
			customEmoji.has(name)
				? `<span data-type="emoji" data-name="${name}"></span>`
				: whole,
		);
}

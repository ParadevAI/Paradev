const PREFIX = "ext-";
const SUFFIX = "-paradev";
const SLACK_CHANNEL_NAME_MAX = 80;

export function customerChannelName(
	organizationName: string,
	stripeCustomerId: string,
): string {
	const slug = organizationName
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const room = SLACK_CHANNEL_NAME_MAX - PREFIX.length - SUFFIX.length;
	const base = (slug || stripeCustomerId.toLowerCase())
		.slice(0, room)
		.replace(/-+$/, "");
	return `${PREFIX}${base}${SUFFIX}`;
}

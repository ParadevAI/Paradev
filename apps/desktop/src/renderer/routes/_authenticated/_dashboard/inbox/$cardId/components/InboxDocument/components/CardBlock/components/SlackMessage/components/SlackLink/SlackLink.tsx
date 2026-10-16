import type { ReactNode } from "react";
import { LuLink } from "react-icons/lu";

const LINK_MAX = 56;

/** A long link the way Slack shortens it: no scheme, the middle elided, the end kept. */
function shortLink(href: string): string {
	const bare = href.replace(/^https?:\/\//, "");
	if (bare.length <= LINK_MAX) return bare;
	const tail = bare.slice(-10);
	return `${bare.slice(0, LINK_MAX - tail.length - 1)}…${tail}`;
}

/** Link text that is just the URL, maybe shortened with an ellipsis, which Slack draws as a chip. */
function isOwnUrl(text: string, href: string): boolean {
	const bare = (v: string) =>
		v
			.replace(/^https?:\/\/(www\.)?/, "")
			.replace(/^www\./, "")
			.replace(/\/$/, "");
	const url = bare(href);
	const parts = bare(text)
		.split(/…|\.\.\./)
		.filter(Boolean);
	return (
		parts.length > 0 &&
		url.startsWith(parts[0] ?? "") &&
		parts.every((part) => url.includes(part))
	);
}

/**
 * A link in a message. One with its own words reads as text; a bare URL, or
 * text that is only the URL, becomes a chip with a link mark, as Slack shows it.
 */
export function SlackLink({
	href,
	children,
}: {
	href: string;
	children?: ReactNode;
}) {
	const label = typeof children === "string" ? children : null;
	if (children && !(label && isOwnUrl(label, href))) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				className="text-blue-500 hover:underline dark:text-sky-400"
			>
				{children}
			</a>
		);
	}
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			title={href}
			className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-sky-500/10 px-1 align-bottom text-blue-500 hover:underline dark:text-sky-400"
		>
			<LuLink className="size-3 shrink-0" />
			<span className="truncate">{label ?? shortLink(href)}</span>
		</a>
	);
}

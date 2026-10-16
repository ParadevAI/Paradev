import { Fragment } from "react";

const URL_PATTERN = /((?:https?:\/\/|mailto:)[^\s<>"']+[^\s<>"'.,;:!?)])/g;

interface LinkedTextProps {
	text: string;
	/** Takes a mailto link instead of the system's mail app. */
	onMailto?: (href: string) => void;
}

/** Plain text with its web and mailto addresses as links. */
export function LinkedText({ text, onMailto }: LinkedTextProps) {
	return text.split(URL_PATTERN).map((piece, i) =>
		i % 2 === 1 ? (
			<a
				// biome-ignore lint/suspicious/noArrayIndexKey: pieces of one text never reorder
				key={i}
				href={piece}
				target="_blank"
				rel="noreferrer"
				onClick={
					onMailto && /^mailto:/i.test(piece)
						? (event) => {
								event.preventDefault();
								onMailto(piece);
							}
						: undefined
				}
				className="text-[#1a73e8] hover:underline dark:text-[#8ab4f8]"
			>
				{piece}
			</a>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: pieces of one text never reorder
			<Fragment key={i}>{piece}</Fragment>
		),
	);
}

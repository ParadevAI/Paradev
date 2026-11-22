import { SOCIAL } from "@superset/shared/constants";
import type { ReactNode } from "react";

// Frontmatter can't import constants, so FAQ answers name social links by token.
const SOCIAL_TOKENS: Record<string, { handle: string; url: string }> = {
	x: SOCIAL.X,
	"x-former": SOCIAL.X_FORMER,
	linkedin: SOCIAL.LINKEDIN,
	youtube: SOCIAL.YOUTUBE,
	discord: SOCIAL.DISCORD,
	github: SOCIAL.GITHUB,
};

const TOKEN_PATTERN = /\{([a-z-]+)\}/g;

function splitTokens(answer: string) {
	return answer.split(TOKEN_PATTERN).map((part, index) => {
		const isToken = index % 2 === 1;
		return { part, link: isToken ? SOCIAL_TOKENS[part] : undefined, isToken };
	});
}

export function renderFaqAnswer(answer: string): ReactNode {
	return splitTokens(answer).map(({ part, link, isToken }, index) => {
		if (!isToken) return part;
		if (!link) return `{${part}}`;
		return (
			<a
				// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
				key={index}
				href={link.url}
				target="_blank"
				rel="noopener noreferrer"
				className="text-foreground underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white/60"
			>
				{link.handle}
			</a>
		);
	});
}

export function faqAnswerText(answer: string): string {
	return splitTokens(answer)
		.map(({ part, link, isToken }) =>
			isToken ? (link?.handle ?? `{${part}}`) : part,
		)
		.join("");
}

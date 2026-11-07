import type { SupportedLocale } from "@superset/i18n";
import { FeaturedPressRow } from "./components/FeaturedPressRow";
import { PRESS_ARTICLES } from "./constants";

interface PressCoverageProps {
	lang: SupportedLocale;
	/** `featured` shows only the highlighted articles; `all` shows every article. */
	variant: "featured" | "all";
}

export function PressCoverage({ lang, variant }: PressCoverageProps) {
	const articles =
		variant === "featured"
			? PRESS_ARTICLES.filter((article) => article.featured)
			: PRESS_ARTICLES;

	return (
		<ul className="divide-y divide-border">
			{articles.map((article) => (
				<li key={article.url}>
					<FeaturedPressRow article={article} lang={lang} />
				</li>
			))}
		</ul>
	);
}

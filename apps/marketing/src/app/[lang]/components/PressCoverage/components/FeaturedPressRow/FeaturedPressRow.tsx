import type { SupportedLocale } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import Image from "next/image";
import { PRESS_DATE_FORMAT, type PressArticle } from "../../constants";

interface FeaturedPressRowProps {
	article: PressArticle;
	lang: SupportedLocale;
}

export function FeaturedPressRow({ article, lang }: FeaturedPressRowProps) {
	return (
		<a
			href={article.url}
			target="_blank"
			rel="noopener noreferrer"
			className="group flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:gap-6"
		>
			<div className="relative aspect-[1.91/1] w-full shrink-0 overflow-hidden border border-border bg-muted sm:w-48">
				{article.image ? (
					<Image
						src={article.image}
						alt=""
						fill
						sizes="(min-width: 640px) 192px, 100vw"
						className="object-cover"
					/>
				) : (
					<div className="flex h-full items-center justify-center">
						<Image
							src={article.icon}
							alt=""
							width={32}
							height={32}
							className="size-8 rounded-md"
						/>
					</div>
				)}
			</div>
			<div className="min-w-0">
				<p className="flex items-center gap-2 font-mono text-muted-foreground text-xs">
					<Image
						src={article.icon}
						alt=""
						width={16}
						height={16}
						className="size-4 shrink-0 rounded-sm"
					/>
					<span>
						{article.outlet} ·{" "}
						<time dateTime={article.date}>
							{formatDate(
								new Date(`${article.date}T00:00:00Z`),
								PRESS_DATE_FORMAT,
								lang,
							)}
						</time>
					</span>
				</p>
				<p
					lang={article.titleLang}
					className="mt-2 font-medium text-foreground text-lg leading-snug underline-offset-4 group-hover:underline"
				>
					{article.title}
				</p>
			</div>
		</a>
	);
}

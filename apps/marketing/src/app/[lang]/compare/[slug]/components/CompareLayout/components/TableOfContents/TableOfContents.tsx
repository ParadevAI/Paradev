import { Trans } from "@lingui/react/macro";
import type { TocItem } from "@/lib/blog-utils";

interface TableOfContentsProps {
	items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
	return (
		<nav
			aria-labelledby="table-of-contents"
			className="mb-12 border-l border-border pl-5"
		>
			<p
				id="table-of-contents"
				className="text-xs font-mono uppercase tracking-wider text-muted-foreground"
			>
				<Trans>On this page</Trans>
			</p>
			<ol className="mt-3 space-y-2 text-sm">
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							className="text-muted-foreground transition-colors hover:text-foreground"
						>
							{item.text}
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}

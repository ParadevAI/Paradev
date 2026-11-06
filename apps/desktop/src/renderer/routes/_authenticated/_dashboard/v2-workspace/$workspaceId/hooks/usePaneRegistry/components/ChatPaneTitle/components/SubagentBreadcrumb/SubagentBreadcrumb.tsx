import { useLingui } from "@lingui/react/macro";
import { ChevronRight } from "lucide-react";
import { Fragment, type MouseEvent } from "react";
import type { SubagentCrumb } from "../../../../stores/chatSubagentStore";

const CRUMB_CLASSNAME =
	"min-w-0 shrink-0 truncate rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

function stopHeaderClick(event: MouseEvent) {
	event.stopPropagation();
}

export function SubagentBreadcrumb({
	root,
	path,
	onSelect,
}: {
	root: string;
	path: readonly SubagentCrumb[];
	onSelect: (id: string | null) => void;
}) {
	const { t } = useLingui();
	const current = path.at(-1);
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: keeps a crumb click from also pinning the pane
		<nav
			aria-label={t({ message: "Breadcrumb" })}
			className="flex min-w-0 items-center gap-1 text-xs"
			onClick={stopHeaderClick}
		>
			<button
				className={CRUMB_CLASSNAME}
				onClick={() => onSelect(null)}
				type="button"
			>
				{root}
			</button>
			{path.slice(0, -1).map((crumb) => (
				<Fragment key={crumb.id}>
					<ChevronRight className="size-3 shrink-0 text-foreground/30" />
					<button
						className={CRUMB_CLASSNAME}
						onClick={() => onSelect(crumb.id)}
						type="button"
					>
						{crumb.title}
					</button>
				</Fragment>
			))}
			{current && (
				<>
					<ChevronRight className="size-3 shrink-0 text-foreground/30" />
					<span
						aria-current="page"
						className="min-w-0 truncate text-foreground"
					>
						{current.title}
					</span>
				</>
			)}
		</nav>
	);
}

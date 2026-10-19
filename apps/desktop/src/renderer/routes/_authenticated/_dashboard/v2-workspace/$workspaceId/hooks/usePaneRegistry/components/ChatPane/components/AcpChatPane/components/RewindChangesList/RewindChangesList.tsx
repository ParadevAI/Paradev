import { Trans } from "@lingui/react/macro";
import type { RewindChange } from "@superset/chat-runtime";

const SHOWN = 6;

export function RewindChangesList({ changes }: { changes: RewindChange[] }) {
	const hidden = changes.length - SHOWN;
	return (
		<ul className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-2 font-mono text-xs">
			{changes.slice(0, SHOWN).map((change) => (
				<li className="flex items-center gap-2" key={change.path}>
					<span className="min-w-0 truncate">{change.path}</span>
					{change.change === "added" && (
						<span className="shrink-0 font-sans text-muted-foreground">
							<Trans>new</Trans>
						</span>
					)}
					{change.change === "deleted" && (
						<span className="shrink-0 font-sans text-muted-foreground">
							<Trans>deleted</Trans>
						</span>
					)}
				</li>
			))}
			{hidden > 0 && (
				<li className="font-sans text-muted-foreground">
					<Trans>and {hidden} more</Trans>
				</li>
			)}
		</ul>
	);
}

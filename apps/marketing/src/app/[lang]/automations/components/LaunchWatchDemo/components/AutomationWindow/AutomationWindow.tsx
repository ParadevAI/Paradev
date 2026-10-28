import { Trans } from "@lingui/react/macro";
import { Clock } from "lucide-react";
import { SiSentry } from "react-icons/si";
import { SentenceChip } from "./components/SentenceChip";

const LABEL =
	"font-mono text-[10px] text-muted-foreground uppercase tracking-widest";
const ROW = "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2";

export function AutomationWindow() {
	return (
		<div className="space-y-5 rounded-lg border border-border bg-background px-4 py-5 text-sm shadow-2xl">
			<p className="flex items-center gap-3 font-medium text-base text-foreground">
				<Trans>Launch watch</Trans>
				<span className="flex h-3.5 w-6 items-center justify-end rounded-full bg-emerald-500 p-0.5">
					<span className="size-2.5 rounded-full bg-white" />
				</span>
			</p>
			<div>
				<p className={LABEL}>
					<Trans>Instructions</Trans>
				</p>
				<p className="mt-1 text-foreground leading-relaxed">
					<Trans>
						Fix new errors in web. Reproduce each one in a test and open a draft
						pull request.
					</Trans>
				</p>
			</div>
			<div>
				<p className={LABEL}>
					<Trans>Triggers</Trans>
				</p>
				<div className="mt-2 divide-y divide-border rounded-md border border-border text-muted-foreground text-xs">
					<div className={ROW}>
						<SiSentry className="size-3.5 shrink-0" />
						<Trans>
							Sentry issue created in <SentenceChip>web</SentenceChip>
						</Trans>
					</div>
					<div className={ROW}>
						<Clock className="size-3.5 shrink-0" />
						<Trans>
							Every day at <SentenceChip>9:00 AM</SentenceChip>
						</Trans>
					</div>
				</div>
			</div>
		</div>
	);
}

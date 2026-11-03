import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { ArrowUpRight } from "lucide-react";
import { USE_CASES } from "./constants";

export function UseCases() {
	const { t } = useLingui();

	return (
		<ul className="mt-12 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
			{USE_CASES.map((useCase) => (
				<li key={useCase.path} className="bg-background">
					<a
						href={`${COMPANY.DOCS_URL}${useCase.path}`}
						className="group flex h-full flex-col p-6 transition-colors hover:bg-muted/30 sm:p-8"
					>
						<span className="font-medium text-foreground text-lg tracking-tight">
							{t(useCase.name)}
						</span>
						<span className="mt-2 text-muted-foreground leading-relaxed">
							{t(useCase.outcome)}
						</span>
						<span className="mt-6 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors group-hover:text-foreground">
							<Trans>Read the guide</Trans>
							<ArrowUpRight className="size-3.5" />
						</span>
					</a>
				</li>
			))}
		</ul>
	);
}

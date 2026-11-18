"use client";

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { DownloadButton } from "@/app/[lang]/components/DownloadButton";

interface ProductHeroActionsProps {
	source: "pages" | "automations" | "browser" | "plugins";
	docsPath: string;
	signInUrl: string;
}

export function ProductHeroActions({
	source,
	docsPath,
	signInUrl,
}: ProductHeroActionsProps) {
	return (
		<div className="mt-8 flex flex-wrap items-center gap-3">
			<DownloadButton source={source} signInUrl={signInUrl} />
			<a
				href={`${COMPANY.DOCS_URL}${docsPath}`}
				className="border border-border px-6 py-3 text-foreground transition-colors hover:bg-muted"
			>
				<Trans>Read the docs</Trans>
			</a>
		</div>
	);
}

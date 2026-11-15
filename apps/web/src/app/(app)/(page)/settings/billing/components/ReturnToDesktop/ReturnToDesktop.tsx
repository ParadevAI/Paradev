"use client";

import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import { Button } from "@superset/ui/button";
import { useEffect } from "react";

export function ReturnToDesktop({ url }: { url: string }) {
	const appName = BRAND.NAME;

	useEffect(() => {
		window.location.href = url;
	}, [url]);

	return (
		<>
			<Button className="mt-3" asChild>
				<a href={url}>
					<Trans>Return to {appName}</Trans>
				</a>
			</Button>
			<p className="text-sm text-muted-foreground">
				<Trans>You can close this tab.</Trans>
			</p>
		</>
	);
}

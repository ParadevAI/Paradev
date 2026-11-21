"use client";

import type { ComponentProps } from "react";
import type { DownloadSource } from "@/lib/analytics";
import { usePlatform } from "../../hooks/useOS";
import { TrackedLink } from "../TrackedLink";

type DownloadLinkProps = Omit<
	ComponentProps<typeof TrackedLink>,
	"href" | "event" | "properties"
> & {
	source: DownloadSource;
	properties?: Record<string, unknown>;
};

export function DownloadLink({
	source,
	properties,
	...linkProps
}: DownloadLinkProps) {
	const { platform } = usePlatform();

	return (
		<TrackedLink
			{...linkProps}
			href="/download"
			event="download_clicked"
			properties={{ platform, source, ...properties }}
		/>
	);
}

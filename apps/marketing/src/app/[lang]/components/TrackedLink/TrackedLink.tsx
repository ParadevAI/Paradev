"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "@/lib/analytics";

type TrackedLinkProps = ComponentProps<typeof Link> & {
	event: string;
	properties?: Record<string, unknown>;
};

export function TrackedLink({
	event,
	properties,
	onClick,
	...linkProps
}: TrackedLinkProps) {
	return (
		<Link
			{...linkProps}
			onClick={(clickEvent) => {
				track(event, properties);
				onClick?.(clickEvent);
			}}
		/>
	);
}

"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";

export function Comment({
	avatar,
	name,
	time,
	children,
}: {
	avatar: ReactNode;
	name: ReactNode;
	time: ReactNode;
	children: ReactNode;
}) {
	return (
		<m.div
			className="flex gap-2"
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.25, ease: "easeOut" }}
		>
			<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] text-foreground/80">
				{avatar}
			</span>
			<div className="min-w-0 text-[11px] leading-snug">
				<p className="flex items-baseline gap-1.5">
					<span className="font-medium text-foreground/95">{name}</span>
					<span className="text-[10px] text-muted-foreground/55">{time}</span>
				</p>
				<p className="mt-0.5 text-muted-foreground">{children}</p>
			</div>
		</m.div>
	);
}

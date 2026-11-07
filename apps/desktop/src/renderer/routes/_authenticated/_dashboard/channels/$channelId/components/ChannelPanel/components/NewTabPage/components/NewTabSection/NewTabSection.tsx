import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { NEW_TAB_HEADER_VARIANTS } from "../../constants";

interface NewTabSectionProps {
	title: ReactNode;
	children: ReactNode;
}

export function NewTabSection({ title, children }: NewTabSectionProps) {
	return (
		<section className="flex flex-col gap-2">
			<motion.h3
				variants={NEW_TAB_HEADER_VARIANTS}
				className="px-1 text-xs font-medium text-muted-foreground"
			>
				{title}
			</motion.h3>
			<div className="grid grid-cols-1 gap-x-4 gap-y-1 @md:grid-cols-2">
				{children}
			</div>
		</section>
	);
}

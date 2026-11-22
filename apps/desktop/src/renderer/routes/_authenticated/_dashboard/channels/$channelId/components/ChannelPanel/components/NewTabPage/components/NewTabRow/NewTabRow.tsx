import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { NEW_TAB_ITEM_VARIANTS } from "../../constants";

interface NewTabRowProps {
	icon: ReactNode;
	label: string;
	meta?: ReactNode;
	onSelect: () => void;
}

export function NewTabRow({ icon, label, meta, onSelect }: NewTabRowProps) {
	return (
		<motion.button
			type="button"
			variants={NEW_TAB_ITEM_VARIANTS}
			onClick={onSelect}
			className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-left text-sm hover:bg-muted"
		>
			<span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">
				{icon}
			</span>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{meta && (
				<span className="ms-auto shrink-0 ps-2 text-xs text-muted-foreground">
					{meta}
				</span>
			)}
		</motion.button>
	);
}

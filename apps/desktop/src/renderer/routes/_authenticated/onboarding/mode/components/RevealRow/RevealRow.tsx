import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const STAGGER_S = 0.07;

interface RevealRowProps {
	play: boolean;
	index: number;
	className?: string;
	children: ReactNode;
}

export function RevealRow({
	play,
	index,
	className,
	children,
}: RevealRowProps) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.div
			initial={play && !reduceMotion ? { opacity: 0, y: 4 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35, ease: "easeOut", delay: index * STAGGER_S }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

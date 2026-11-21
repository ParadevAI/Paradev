"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";

interface SceneLayerProps {
	visible: boolean;
	children: ReactNode;
	className?: string;
}

export function SceneLayer({
	visible,
	children,
	className = "",
}: SceneLayerProps) {
	return (
		<m.div
			className={`absolute inset-0 ${className}`}
			initial={false}
			animate={{ opacity: visible ? 1 : 0 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
			style={{ pointerEvents: visible ? "auto" : "none" }}
			aria-hidden={!visible}
		>
			{children}
		</m.div>
	);
}

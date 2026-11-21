"use client";

import { m } from "framer-motion";
import type { ReactNode, Ref } from "react";

interface DemoWindowProps {
	windowRef: Ref<HTMLDivElement>;
	inView: boolean;
	children: ReactNode;
	className?: string;
}

export function DemoWindow({
	windowRef,
	inView,
	children,
	className = "",
}: DemoWindowProps) {
	return (
		<m.div
			ref={windowRef}
			className={`relative flex flex-col overflow-hidden rounded-xl bg-[#161616] font-[450] text-[13px] leading-5 shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75),inset_0_0_0_1px_rgb(255_255_255/0.07)] [&_svg[fill=none]]:stroke-[1.5] ${className}`}
			initial={{ opacity: 0, y: 20 }}
			animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			{children}
		</m.div>
	);
}

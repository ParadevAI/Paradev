"use client";

import { useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { StarField } from "./components/StarField";

const Dithering = dynamic(
	() => import("@paper-design/shaders-react").then((mod) => mod.Dithering),
	{ ssr: false },
);

interface CloudSkyProps {
	className?: string;
}

export function CloudSky({ className = "" }: CloudSkyProps) {
	const reducedMotion = useReducedMotion();

	return (
		<div
			aria-hidden="true"
			className={`pointer-events-none [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_75%,transparent)] ${className}`}
		>
			<StarField />
			<div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black,black_35%,transparent_85%)]">
				<Dithering
					colorBack="#00000000"
					colorFront="#454545"
					shape="simplex"
					type="4x4"
					size={3}
					scale={0.4}
					speed={reducedMotion ? 0 : 0.04}
					className="size-full"
					minPixelRatio={1}
				/>
			</div>
		</div>
	);
}

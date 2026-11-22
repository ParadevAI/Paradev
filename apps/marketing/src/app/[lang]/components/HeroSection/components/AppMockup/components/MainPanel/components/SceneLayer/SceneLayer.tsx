import type { ReactNode } from "react";

interface SceneLayerProps {
	visible: boolean;
	children: ReactNode;
}

export function SceneLayer({ visible, children }: SceneLayerProps) {
	return (
		<div
			className={`absolute inset-0 transition-[opacity,visibility] duration-300 ease-out motion-reduce:transition-none ${visible ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}
			aria-hidden={!visible}
		>
			{children}
		</div>
	);
}

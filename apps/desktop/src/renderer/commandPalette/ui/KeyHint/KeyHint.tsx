import type { ReactNode } from "react";
import { KeyCaps } from "../KeyCaps";

interface KeyHintProps {
	keys: string[];
	label: ReactNode;
}

export function KeyHint({ keys, label }: KeyHintProps) {
	return (
		<span className="flex items-center gap-1.5">
			<KeyCaps keys={keys} />
			{label}
		</span>
	);
}

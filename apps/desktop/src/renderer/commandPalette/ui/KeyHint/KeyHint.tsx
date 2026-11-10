import { Kbd, KbdGroup } from "@superset/ui/kbd";
import type { ReactNode } from "react";

interface KeyHintProps {
	keys: string[];
	label: ReactNode;
}

export function KeyHint({ keys, label }: KeyHintProps) {
	return (
		<span className="flex items-center gap-1.5">
			<KbdGroup>
				{keys.map((key, index) => (
					<Kbd
						// Chords never repeat a key, but a cap has no identity beyond its position.
						key={`${index}-${key}`}
						className="h-[18px] min-w-[18px] text-[11px]"
					>
						{key}
					</Kbd>
				))}
			</KbdGroup>
			{label}
		</span>
	);
}

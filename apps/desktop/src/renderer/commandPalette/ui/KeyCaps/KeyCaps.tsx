import { Kbd, KbdGroup } from "@superset/ui/kbd";

interface KeyCapsProps {
	keys: string[];
	className?: string;
}

export function KeyCaps({ keys, className }: KeyCapsProps) {
	return (
		<KbdGroup className={className}>
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
	);
}

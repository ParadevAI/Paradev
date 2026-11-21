"use client";

interface SelectorPillProps {
	label: string;
	active?: boolean;
	onSelect?: () => void;
}

export function SelectorPill({
	label,
	active = false,
	onSelect,
}: SelectorPillProps) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onMouseEnter={onSelect}
			onClick={onSelect}
			className={`relative flex h-10 shrink-0 cursor-pointer items-center whitespace-nowrap px-4 text-left text-xs transition-[color,transform] duration-300 ease-out sm:text-sm lg:w-full lg:pl-5 ${
				active
					? "text-foreground lg:translate-x-1"
					: "text-muted-foreground/60 hover:text-foreground/80"
			}`}
		>
			{label}
		</button>
	);
}

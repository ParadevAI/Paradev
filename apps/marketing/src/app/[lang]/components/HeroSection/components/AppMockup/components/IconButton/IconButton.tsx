import type { IconType } from "react-icons";

interface IconButtonProps {
	icon: IconType;
	tone?: "default" | "faint" | "active";
}

const TONES = {
	default: "text-neutral-100/55",
	faint: "text-neutral-100/30",
	active: "bg-neutral-100/10 text-neutral-100/90",
} as const;

export function IconButton({ icon: Icon, tone = "default" }: IconButtonProps) {
	return (
		<span
			className={`flex size-7 shrink-0 items-center justify-center rounded-md ${TONES[tone]}`}
		>
			<Icon className="size-4" />
		</span>
	);
}

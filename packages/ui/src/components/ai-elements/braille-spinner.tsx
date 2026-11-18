import { cn } from "../../lib/utils";

export function BrailleSpinner({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"text-base font-mono select-none text-amber-500 before:animate-braille-spin",
				className,
			)}
		/>
	);
}

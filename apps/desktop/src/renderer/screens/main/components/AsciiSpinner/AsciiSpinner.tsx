import { cn } from "@superset/ui/utils";

interface AsciiSpinnerProps {
	className?: string;
}

/**
 * Braille spinner that replaces the folder icon when an agent is working.
 * The frames are a CSS animation, so it costs no React renders.
 */
export function AsciiSpinner({ className }: AsciiSpinnerProps) {
	return (
		<span
			className={cn(
				"text-amber-500 font-mono select-none braille-spin",
				className,
			)}
			aria-hidden="true"
		/>
	);
}

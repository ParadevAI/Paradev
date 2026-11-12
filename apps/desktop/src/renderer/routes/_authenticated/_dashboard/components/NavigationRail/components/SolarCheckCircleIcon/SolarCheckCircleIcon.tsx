interface SolarCheckCircleIconProps {
	className?: string;
	strokeWidth?: number;
}

// "check-circle" (linear) from the Solar icon set by 480 Design, CC BY 4.0:
// https://creativecommons.org/licenses/by/4.0/. The licence requires this credit.
export function SolarCheckCircleIcon({
	className,
	strokeWidth = 1.5,
}: SolarCheckCircleIconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			className={className}
			aria-hidden="true"
		>
			<g
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth={strokeWidth}
			>
				<circle cx="12" cy="12" r="10" />
				<path strokeLinejoin="round" d="M8.5 12.5L10.5 14.5L15.5 9.5" />
			</g>
		</svg>
	);
}

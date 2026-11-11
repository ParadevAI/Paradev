interface DevicesIconProps {
	className?: string;
	strokeWidth?: number;
}

export function DevicesIcon({
	className,
	strokeWidth = 1.75,
}: DevicesIconProps) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M11.5 14H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2" />
			<path d="M2 17.5h9.5" />
			<rect x="14" y="11" width="7" height="10" rx="1.5" />
			<path d="M17 18h1" />
		</svg>
	);
}

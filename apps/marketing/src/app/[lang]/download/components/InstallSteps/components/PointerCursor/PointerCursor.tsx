interface PointerCursorProps {
	className?: string;
}

export function PointerCursor({ className = "" }: PointerCursorProps) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 22"
			className={`pointer-events-none absolute h-5 w-auto drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] ${className}`}
		>
			<path
				d="M1 1v17l4.6-4.4 3 6.9 2.9-1.3-3-6.8H15z"
				fill="#000"
				stroke="#fff"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

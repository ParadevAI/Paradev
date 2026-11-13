/** Two stacked rounded squares: the front one solid, the one behind it an outline. */
export function WorkspacesIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<path
				d="M9.5 6.5V6A2.5 2.5 0 0 1 12 3.5h6A2.5 2.5 0 0 1 20.5 6v6a2.5 2.5 0 0 1-2.5 2.5h-.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<rect
				x="3.5"
				y="8.5"
				width="12"
				height="12"
				rx="3.5"
				fill="currentColor"
			/>
		</svg>
	);
}

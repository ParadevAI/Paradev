/** The cloud mark for cloud workspaces, drawn on a 16px grid to sit with Lucide icons. */
export function CloudGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="1.5 1.2 13.5 13.5"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.1}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			<path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6A2.5 2.5 0 0 0 4.5 12.5Z" />
		</svg>
	);
}

interface AppFrameProps {
	children: React.ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
	return (
		<div className="absolute inset-0 p-2 bg-stone-950 flex gap-2">
			{children}
		</div>
	);
}

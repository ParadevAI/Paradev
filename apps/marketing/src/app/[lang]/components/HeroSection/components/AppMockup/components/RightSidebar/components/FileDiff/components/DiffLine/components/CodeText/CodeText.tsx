const TOKEN = /("[^"]*"|\/\/.*$|\b(?:import|from|export|function|return)\b)/;

interface CodeTextProps {
	code: string;
}

export function CodeText({ code }: CodeTextProps) {
	const parts = code.split(TOKEN);
	return (
		<>
			{parts.map((part, index) => {
				const key = `${index}-${part}`;
				if (part.startsWith('"'))
					return (
						<span key={key} className="text-neutral-100/55">
							{part}
						</span>
					);
				if (part.startsWith("//"))
					return (
						<span key={key} className="text-neutral-100/40">
							{part}
						</span>
					);
				if (index % 2 === 1)
					return (
						<span key={key} className="text-neutral-100/90">
							{part}
						</span>
					);
				return part;
			})}
		</>
	);
}

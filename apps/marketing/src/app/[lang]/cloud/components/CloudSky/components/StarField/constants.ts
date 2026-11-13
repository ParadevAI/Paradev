interface Star {
	x: number;
	y: number;
	sparkle: boolean;
}

function seeded(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

const random = seeded(7);

export const STARS: Star[] = Array.from({ length: 90 }, (_, index) => ({
	x: random() * 100,
	y: random() * 100,
	sparkle: index % 15 === 0,
}));

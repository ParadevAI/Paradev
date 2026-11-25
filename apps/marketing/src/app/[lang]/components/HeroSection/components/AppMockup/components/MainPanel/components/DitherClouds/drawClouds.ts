import { BAYER, CELL, DOT, DRIFT_PER_FRAME, LATTICE_SIZE } from "./constants";

const hash = (i: number, j: number) => {
	const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
	return h - Math.floor(h);
};

// The cloud field samples the lattice about a million times per frame, so the
// hash is read from a wrapping table instead of computed with Math.sin.
const LATTICE = new Float32Array(LATTICE_SIZE * LATTICE_SIZE);
for (let j = 0; j < LATTICE_SIZE; j++) {
	for (let i = 0; i < LATTICE_SIZE; i++) {
		LATTICE[j * LATTICE_SIZE + i] = hash(i, j);
	}
}
const lattice = (i: number, j: number) =>
	LATTICE[(j & (LATTICE_SIZE - 1)) * LATTICE_SIZE + (i & (LATTICE_SIZE - 1))] ??
	0;

const smooth = (t: number) => t * t * (3 - 2 * t);

const noise = (x: number, y: number) => {
	const i = Math.floor(x);
	const j = Math.floor(y);
	const u = smooth(x - i);
	const v = smooth(y - j);
	const a = lattice(i, j);
	const b = lattice(i + 1, j);
	const c = lattice(i, j + 1);
	const d = lattice(i + 1, j + 1);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (x: number, y: number) => {
	let sum = 0;
	let amp = 0.5;
	for (let o = 0; o < 5; o++) {
		sum += amp * noise(x, y);
		x *= 2.03;
		y *= 2.03;
		amp *= 0.5;
	}
	return sum;
};

const STARS = Array.from({ length: 70 }, (_, i) => ({
	x: hash(i, 1.7),
	y: hash(i, 9.3),
	sparkle: i % 13 === 0,
	phase: hash(i, 4.1) * Math.PI * 2,
}));

export function drawClouds(
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	width: number,
	height: number,
	frame: number,
) {
	const cols = Math.ceil(width / CELL);
	const rows = Math.ceil(height / CELL);
	const t = frame * DRIFT_PER_FRAME;
	ctx.clearRect(0, 0, width, height);

	for (let j = 0; j < rows; j++) {
		const ny = j / rows;
		for (let i = 0; i < cols; i++) {
			const nx = i / cols;
			const px = nx * 7.5 + t;
			const py = ny * 4.2;
			const warp = fbm(px * 0.6 + 7.3, py * 0.6 - t * 0.5);
			let d = fbm(px + warp * 1.8, py + warp * 0.9);
			const band =
				0.75 * Math.exp(-(((ny - 0.08 - nx * 0.06) / 0.17) ** 2)) +
				0.8 * Math.exp(-(((ny - 0.72 + (1 - nx) * 0.25) / 0.22) ** 2));
			d = (d * (0.55 + 0.6 * band) - 0.53) * 3.2;
			if (d <= 0) continue;
			const level = Math.min(d, 0.82);
			if (level * 64 <= (BAYER[j % 8]?.[i % 8] ?? 0)) continue;
			ctx.fillStyle = `rgba(232,232,236,${0.14 + 0.38 * level})`;
			ctx.fillRect(i * CELL, j * CELL, DOT, DOT);
		}
	}

	for (const star of STARS) {
		const twinkle = 0.45 + 0.55 * Math.sin(frame * 0.09 + star.phase) ** 2;
		const x = Math.floor((star.x * width) / CELL) * CELL;
		const y = Math.floor((star.y * height) / CELL) * CELL;
		ctx.fillStyle = `rgba(255,255,255,${(star.sparkle ? 0.9 : 0.55) * twinkle})`;
		ctx.fillRect(x, y, DOT, DOT);
		if (star.sparkle) {
			ctx.fillStyle = `rgba(255,255,255,${0.45 * twinkle})`;
			ctx.fillRect(x - CELL, y, DOT, DOT);
			ctx.fillRect(x + CELL, y, DOT, DOT);
			ctx.fillRect(x, y - CELL, DOT, DOT);
			ctx.fillRect(x, y + CELL, DOT, DOT);
		}
	}
}

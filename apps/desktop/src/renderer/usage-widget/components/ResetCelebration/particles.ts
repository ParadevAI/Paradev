export function drawResetCelebration(
	canvas: HTMLCanvasElement,
	kind: "session" | "weekly",
) {
	const context = canvas.getContext("2d");
	if (!context) return () => {};
	const width = window.innerWidth,
		height = window.innerHeight;
	const scale = Math.min(devicePixelRatio || 1, 2);
	canvas.width = width * scale;
	canvas.height = height * scale;
	context.scale(scale, scale);
	const weekly = kind === "weekly";
	const duration = weekly ? 4800 : 2400;
	const colors = weekly
		? ["#6ee7b7", "#67e8f9", "#fde68a", "#fda4af", "#c4b5fd", "#ffffff"]
		: ["#6ee7b7", "#a7f3d0", "#fef3c7", "#ffffff"];
	const particles = Array.from({ length: weekly ? 220 : 65 }, (_, index) => {
		const side = index % 2 === 0 ? -1 : 1;
		const wave = weekly ? Math.floor(index / 74) * 310 : 0;
		const speed = weekly
			? 220 + Math.random() * 450
			: 110 + Math.random() * 160;
		const angle = weekly
			? (side === -1 ? -Math.PI / 3 : (-2 * Math.PI) / 3) +
				(Math.random() - 0.5) * 1.1
			: -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
		return {
			x: weekly ? (side === -1 ? width * 0.14 : width * 0.86) : width - 150,
			y: weekly ? height * 0.76 : 94,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			delay: wave,
			spin: (Math.random() - 0.5) * 12,
			size: 3 + Math.random() * 5,
			color: colors[index % colors.length] ?? "#fff",
			star: weekly && index % 5 === 0,
		};
	});
	let frame = 0,
		stopped = false;
	const start = performance.now();
	const render = (at: number) => {
		if (stopped) return;
		const elapsed = at - start;
		context.clearRect(0, 0, width, height);
		for (const p of particles) {
			const t = (elapsed - p.delay) / 1000;
			if (t < 0) continue;
			const life = duration / 1000 - p.delay / 1000;
			const x = p.x + p.vx * t * 0.8,
				y = p.y + p.vy * t + 125 * t * t;
			context.globalAlpha = Math.max(0, Math.min(1, (life - t) * 1.4));
			context.save();
			context.translate(x, y);
			context.rotate(p.spin * t);
			context.fillStyle = p.color;
			if (p.star) {
				context.beginPath();
				for (let i = 0; i < 8; i++) {
					const a = (i * Math.PI) / 4,
						r = i % 2 === 0 ? p.size * 1.4 : p.size * 0.35;
					context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
				}
				context.closePath();
				context.fill();
			} else
				context.fillRect(
					-p.size / 2,
					-p.size / 2,
					p.size,
					Math.cos(t * 8) * p.size * 0.65,
				);
			context.restore();
		}
		if (elapsed < duration) frame = requestAnimationFrame(render);
		else context.clearRect(0, 0, width, height);
	};
	frame = requestAnimationFrame(render);
	return () => {
		stopped = true;
		cancelAnimationFrame(frame);
		context.clearRect(0, 0, width, height);
	};
}

"use client";

import { m } from "framer-motion";
import { useEffect, useRef } from "react";

// character grid: glyphs stay upright and snapped, like real terminal text
const CELL = 13;
const FONT_SIZE = 11;

// the source text each boid writes as it flies, so trails spell real code
const CODE =
	'awaitagent.spawn({preset:"claude",workspace:"boid"})superset.orchestrate({agents:100,' +
	'parallel:true})agent.review({channel:"all",sla:"24h"})awaitworktree.create({branch:"main",' +
	"isolate:true})flock.align({perception:75,cohesion:0.8})if(!agent.idle())thrownewAgentBusyError" +
	'("BOID_1")terminal.attach({pty:daemon,rows:42})pr.merge({squash:true,title:"feat(desktop):flock"})';

const MAX_BOIDS = 90;
const MIN_BOIDS = 24;
const AREA_PER_BOID = 22000;
const PERCEPTION = 90;
const SEPARATION_DIST = 44;
const MAX_SPEED = 1.2;
const MAX_FORCE = 0.035;
const W_SEPARATION = 1.7;
const W_ALIGNMENT = 1.0;
const W_COHESION = 0.45;
const W_SEEK = 0.5;
const SEEK_ARRIVE_RADIUS = 280;
const TRAIL_DECAY = 0.996;

// the simulation is tuned in 60 Hz steps; glyphs snap to the grid, so drawing
// at half that rate looks the same
const STEP_MS = 1000 / 60;
const DRAW_INTERVAL_MS = 1000 / 30;
const MAX_STEPS_PER_DRAW = 3;

const RIPPLE_SPEED = 14;
const RIPPLE_BAND = 110;

// glyphs blend toward the brand ember inside a click ripple
const ORANGE: readonly [number, number, number] = [190, 80, 18];

// The flock fades out above the product demo so the mockup sits on a clean
// backdrop instead of glyph noise. Percentages are of the hero height.
const FLOCK_HEIGHT_PERCENT = 65;
const FADE_START_PERCENT = (40 / FLOCK_HEIGHT_PERCENT) * 100;
const FADE = `linear-gradient(to bottom, transparent ${FADE_START_PERCENT}%, var(--background) 100%)`;

function trailGray(): number {
	const r = Math.random();
	if (r < 0.7) return 45;
	if (r < 0.92) return 56;
	return 68;
}

function heatedColor(gray: number, heat: number): string {
	const r = Math.round(gray + (ORANGE[0] - gray) * heat);
	const g = Math.round(gray + (ORANGE[1] - gray) * heat);
	const b = Math.round(gray + (ORANGE[2] - gray) * heat);
	return `rgb(${r}, ${g}, ${b})`;
}

interface TrailGlyph {
	char: string;
	gray: number;
	alpha: number;
	x: number;
	y: number;
}

interface Ripple {
	x: number;
	y: number;
	r: number;
}

export function BoidsBackground() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const solidRegionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const solidRegion = solidRegionRef.current;
		if (!canvas || !solidRegion) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const cell = CELL * dpr;
		let width = 0;
		let height = 0;

		const mouse = { x: 0, y: 0, active: false };
		const ripples: Ripple[] = [];
		const trail = new Map<string, TrailGlyph>();

		function setFont() {
			if (!ctx) return;
			ctx.font = `${FONT_SIZE * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
		}

		const grayColors = new Map<number, string>();
		let fillColor = "";

		function setGlyphStyle(gray: number, alpha: number, heat: number) {
			if (!ctx) return;
			let color = grayColors.get(gray);
			if (!color) {
				color = `rgb(${gray}, ${gray}, ${gray})`;
				grayColors.set(gray, color);
			}
			if (heat > 0) color = heatedColor(gray, heat);
			if (color !== fillColor) {
				ctx.fillStyle = color;
				fillColor = color;
			}
			ctx.globalAlpha = heat > 0 ? Math.min(1, alpha + heat * 0.3) : alpha;
		}

		function rippleHeat(x: number, y: number): number {
			let heat = 0;
			for (const rp of ripples) {
				const d = Math.hypot(x - rp.x, y - rp.y);
				const t = 1 - Math.abs(d - rp.r) / (RIPPLE_BAND * dpr);
				if (t > heat) heat = t;
			}
			return heat;
		}

		class Boid {
			x = Math.random() * width;
			y = Math.random() * height;
			vx: number;
			vy: number;
			ax = 0;
			ay = 0;
			ptr = Math.floor(Math.random() * CODE.length);
			sx = this.x;
			sy = this.y;
			headChar = CODE.charAt(this.ptr);

			constructor() {
				const a = Math.random() * Math.PI * 2;
				const s = MAX_SPEED * dpr * (0.5 + Math.random() * 0.5);
				this.vx = Math.cos(a) * s;
				this.vy = Math.sin(a) * s;
			}

			steer(dx: number, dy: number, weight: number) {
				const mag = Math.hypot(dx, dy);
				if (mag === 0) return;
				const max = MAX_SPEED * dpr;
				let fx = (dx / mag) * max - this.vx;
				let fy = (dy / mag) * max - this.vy;
				const fmag = Math.hypot(fx, fy);
				const maxForce = MAX_FORCE * dpr;
				if (fmag > maxForce) {
					fx = (fx / fmag) * maxForce;
					fy = (fy / fmag) * maxForce;
				}
				this.ax += fx * weight;
				this.ay += fy * weight;
			}

			flock(boids: Boid[]) {
				let sepX = 0;
				let sepY = 0;
				let sepN = 0;
				let aliX = 0;
				let aliY = 0;
				let aliN = 0;
				let cohX = 0;
				let cohY = 0;
				let cohN = 0;

				for (const other of boids) {
					if (other === this) continue;
					const dx = other.x - this.x;
					const dy = other.y - this.y;
					const d = Math.hypot(dx, dy);
					if (d > PERCEPTION * dpr || d === 0) continue;

					if (d < SEPARATION_DIST * dpr) {
						sepX -= dx / d / d;
						sepY -= dy / d / d;
						sepN++;
					}
					aliX += other.vx;
					aliY += other.vy;
					aliN++;
					cohX += other.x;
					cohY += other.y;
					cohN++;
				}

				if (sepN > 0) this.steer(sepX, sepY, W_SEPARATION);
				if (aliN > 0) this.steer(aliX / aliN, aliY / aliN, W_ALIGNMENT);
				if (cohN > 0)
					this.steer(cohX / cohN - this.x, cohY / cohN - this.y, W_COHESION);

				if (mouse.active) {
					const tx = mouse.x - this.x;
					const ty = mouse.y - this.y;
					const d = Math.hypot(tx, ty);
					const arrive = SEEK_ARRIVE_RADIUS * dpr;
					const w = d < arrive ? W_SEEK * (d / arrive) : W_SEEK;
					this.steer(tx, ty, w);
				}
			}

			update() {
				this.vx += this.ax;
				this.vy += this.ay;
				const speed = Math.hypot(this.vx, this.vy);
				const max = MAX_SPEED * dpr;
				if (speed > max) {
					this.vx = (this.vx / speed) * max;
					this.vy = (this.vy / speed) * max;
				}
				this.x += this.vx;
				this.y += this.vy;
				this.ax = 0;
				this.ay = 0;

				let wrapped = false;
				if (this.x < -cell) {
					this.x = width + cell;
					wrapped = true;
				}
				if (this.x > width + cell) {
					this.x = -cell;
					wrapped = true;
				}
				if (this.y < -cell) {
					this.y = height + cell;
					wrapped = true;
				}
				if (this.y > height + cell) {
					this.y = -cell;
					wrapped = true;
				}

				// write the next character only after real net displacement: a boid
				// hovering on a cell boundary shouldn't flicker through its code string
				if (wrapped) {
					this.sx = this.x;
					this.sy = this.y;
				} else if (
					Math.hypot(this.x - this.sx, this.y - this.sy) >=
					cell * 1.5
				) {
					this.sx = this.x;
					this.sy = this.y;
					const char = CODE.charAt(this.ptr % CODE.length);
					this.ptr++;
					if (char !== " ") {
						const cx = Math.round(this.x / cell);
						const cy = Math.round(this.y / cell);
						trail.set(`${cx},${cy}`, {
							char,
							gray: trailGray(),
							alpha: 0.22 + Math.random() * 0.1,
							x: cx * cell,
							y: cy * cell,
						});
					}
				}
				this.headChar = CODE.charAt(this.ptr % CODE.length);
			}

			drawHead() {
				if (!ctx) return;
				const cx = Math.round(this.x / cell) * cell;
				const cy = Math.round(this.y / cell) * cell;
				setGlyphStyle(52, 0.35, rippleHeat(cx, cy));
				ctx.fillText(this.headChar === " " ? "." : this.headChar, cx, cy);
			}
		}

		let boids: Boid[] = [];

		function resize() {
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			width = rect.width * dpr;
			height = rect.height * dpr;
			canvas.width = width;
			canvas.height = height;
			fillColor = "";
			setFont();
			if (boids.length === 0 && width > 0 && height > 0) {
				const count = Math.round((rect.width * rect.height) / AREA_PER_BOID);
				boids = Array.from(
					{ length: Math.min(MAX_BOIDS, Math.max(MIN_BOIDS, count)) },
					() => new Boid(),
				);
			}
		}

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		function toLocal(e: MouseEvent): { x: number; y: number } | null {
			if (!canvas) return null;
			const rect = canvas.getBoundingClientRect();
			return {
				x: (e.clientX - rect.left) * dpr,
				y: (e.clientY - rect.top) * dpr,
			};
		}

		function onMouseMove(e: MouseEvent) {
			const p = toLocal(e);
			if (!p) return;
			mouse.x = p.x;
			mouse.y = p.y;
			// only follow the cursor while it is over the hero
			mouse.active = p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
		}

		function onMouseDown(e: MouseEvent) {
			const p = toLocal(e);
			if (!p || p.x < 0 || p.x > width || p.y < 0 || p.y > height) return;
			ripples.push({ x: p.x, y: p.y, r: 0 });
		}

		function onMouseLeave() {
			mouse.active = false;
		}

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mousedown", onMouseDown);
		document.addEventListener("mouseleave", onMouseLeave);

		// pause the simulation once only the faded part of the flock is on screen
		let visible = true;
		const intersection = new IntersectionObserver((entries) => {
			visible = entries[0]?.isIntersecting ?? true;
		});
		intersection.observe(solidRegion);

		function step() {
			for (let i = ripples.length - 1; i >= 0; i--) {
				const rp = ripples[i];
				if (!rp) continue;
				rp.r += RIPPLE_SPEED * dpr;
				if (rp.r - RIPPLE_BAND * dpr > Math.hypot(width, height)) {
					ripples.splice(i, 1);
				}
			}
			for (const [key, g] of trail) {
				g.alpha *= TRAIL_DECAY;
				if (g.alpha < 0.03) trail.delete(key);
			}
			for (const b of boids) b.flock(boids);
			for (const b of boids) b.update();
		}

		function draw() {
			if (!ctx) return;
			ctx.clearRect(0, 0, width, height);
			for (const g of trail.values()) {
				setGlyphStyle(g.gray, g.alpha, rippleHeat(g.x, g.y));
				ctx.fillText(g.char, g.x, g.y);
			}
			for (const b of boids) b.drawHead();
		}

		let raf = 0;
		let lastDraw = 0;
		function frame(now: number) {
			raf = requestAnimationFrame(frame);
			if (!visible || width === 0) {
				lastDraw = 0;
				return;
			}
			const elapsed = lastDraw === 0 ? DRAW_INTERVAL_MS : now - lastDraw;
			// a ripple is direct feedback to a click, so it draws on every frame
			if (ripples.length === 0 && elapsed < DRAW_INTERVAL_MS - STEP_MS / 2) {
				return;
			}
			lastDraw = now;
			const steps = Math.min(
				MAX_STEPS_PER_DRAW,
				Math.max(1, Math.round(elapsed / STEP_MS)),
			);
			for (let i = 0; i < steps; i++) step();
			draw();
		}
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
			intersection.disconnect();
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("mouseleave", onMouseLeave);
		};
	}, []);

	return (
		<m.div
			className="absolute inset-x-0 top-0 pointer-events-none z-0"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 1.2, ease: "easeOut" }}
			aria-hidden="true"
			style={{ height: `${FLOCK_HEIGHT_PERCENT}%` }}
		>
			<div
				ref={solidRegionRef}
				className="absolute inset-x-0 top-0"
				style={{ height: `${FADE_START_PERCENT}%` }}
			/>
			<canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
			<div className="absolute inset-0" style={{ background: FADE }} />
		</m.div>
	);
}

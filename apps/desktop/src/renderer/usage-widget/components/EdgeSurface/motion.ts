export interface EdgeFrame {
	width: number;
	height: number;
	openness: number;
}
export interface EdgeSpring {
	frame: EdgeFrame;
	velocity: EdgeFrame;
}
export function restingEdge(frame: EdgeFrame): EdgeSpring {
	return { frame, velocity: { width: 0, height: 0, openness: 0 } };
}
export function advanceEdge(
	state: EdgeSpring,
	target: EdgeFrame,
	seconds: number,
): EdgeSpring {
	const dt = Math.min(0.032, Math.max(0, seconds));
	const frequency = target.openness === 1 ? 20 : 24;
	const decay = Math.exp(-frequency * dt);
	const next = restingEdge({ ...state.frame });
	for (const axis of ["width", "height", "openness"] as const) {
		const offset = state.frame[axis] - target[axis];
		const speed = state.velocity[axis];
		const impulse = speed + frequency * offset;
		next.frame[axis] = target[axis] + (offset + impulse * dt) * decay;
		next.velocity[axis] = (speed - frequency * impulse * dt) * decay;
	}
	return next;
}
export function edgeAtRest(state: EdgeSpring, target: EdgeFrame) {
	return (["width", "height", "openness"] as const).every((axis) => {
		const tolerance = axis === "openness" ? 0.001 : 0.5;
		return (
			Math.abs(state.frame[axis] - target[axis]) < tolerance &&
			Math.abs(state.velocity[axis]) < tolerance * 20
		);
	});
}
export function edgeFade(value: number, start: number, end: number) {
	const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
	return t * t * (3 - 2 * t);
}
export function edgeContour(width: number, height: number) {
	const w = Math.max(24, width),
		h = Math.max(40, height);
	const s = 8,
		r = 13;
	return `M ${w} 0 Q ${w} ${s} ${w - s} ${s} H ${r} Q 0 ${s} 0 ${s + r} V ${h - s - r} Q 0 ${h - s} ${r} ${h - s} H ${w - s} Q ${w} ${h - s} ${w} ${h} Z`;
}

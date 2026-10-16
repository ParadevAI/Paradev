interface Segment {
	from: number;
	to: number;
}

/** Puts overlapping blocks side by side: each gets a lane and the lane count of its cluster. */
export function layoutLanes<T extends Segment>(
	items: T[],
): (T & { lane: number; lanes: number })[] {
	const sorted = [...items].sort((a, b) => a.from - b.from || b.to - a.to);
	const placed: (T & { lane: number; lanes: number })[] = [];
	let cluster: (T & { lane: number; lanes: number })[] = [];
	let clusterEnd = -1;
	let laneEnds: number[] = [];
	const close = () => {
		for (const item of cluster) item.lanes = laneEnds.length;
		placed.push(...cluster);
	};
	for (const item of sorted) {
		if (item.from >= clusterEnd) {
			close();
			cluster = [];
			laneEnds = [];
		}
		let lane = laneEnds.findIndex((end) => end <= item.from);
		if (lane === -1) lane = laneEnds.length;
		laneEnds[lane] = item.to;
		clusterEnd = Math.max(clusterEnd, item.to);
		cluster.push({ ...item, lane, lanes: 1 });
	}
	close();
	return placed;
}

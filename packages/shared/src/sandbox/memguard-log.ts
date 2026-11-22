/** One action `superset-memguard` logged: a kill, or pressure it found nothing to kill for. */
export type MemguardAction =
	| {
			kind: "reap";
			at: number;
			rssMb: number;
			adj: number;
			availableMb: number;
			floorMb: number;
	  }
	| { kind: "pressure"; at: number; availableMb: number; floorMb: number };

const REAP_LINE =
	/^(\d+) memguard reap pid=\d+ .+? rss=(\d+)MB adj=(-?\d+) available=(\d+)MB drop=\d+MB floor=(\d+)MB$/;
const PRESSURE_LINE =
	/^(\d+) memguard pressure available=(\d+)MB floor=(\d+)MB nothing to reap$/;

/** The process name stays out: whatever an agent ran chose it. */
export function parseMemguardAction(line: string): MemguardAction | null {
	const reap = REAP_LINE.exec(line);
	if (reap) {
		return {
			kind: "reap",
			at: Number(reap[1]),
			rssMb: Number(reap[2]),
			adj: Number(reap[3]),
			availableMb: Number(reap[4]),
			floorMb: Number(reap[5]),
		};
	}
	const pressure = PRESSURE_LINE.exec(line);
	if (!pressure) return null;
	return {
		kind: "pressure",
		at: Number(pressure[1]),
		availableMb: Number(pressure[2]),
		floorMb: Number(pressure[3]),
	};
}

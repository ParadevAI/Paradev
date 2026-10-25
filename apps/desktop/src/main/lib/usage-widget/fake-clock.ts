export class FakeClock {
	private now = 0;
	private sequence = 0;
	private timers = new Map<number, { at: number; callback: () => void }>();
	maximumPending = 0;
	get pending() {
		return this.timers.size;
	}
	schedule = (callback: () => void, delay: number) => {
		const id = ++this.sequence;
		this.timers.set(id, { at: this.now + delay, callback });
		this.maximumPending = Math.max(this.maximumPending, this.pending);
		return () => {
			this.timers.delete(id);
		};
	};
	advance(milliseconds: number) {
		const target = this.now + milliseconds;
		while (true) {
			const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
			if (!next || next[1].at > target) break;
			this.timers.delete(next[0]);
			this.now = next[1].at;
			next[1].callback();
		}
		this.now = target;
	}
}

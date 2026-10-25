export class RefreshQueue {
	private pending: Promise<void> | null = null;
	private queued = false;
	private forced = false;
	constructor(private readonly refresh: (force: boolean) => Promise<void>) {}
	request(force = false): Promise<void> {
		this.queued = true;
		this.forced ||= force;
		if (!this.pending)
			this.pending = this.drain().finally(() => {
				this.pending = null;
			});
		return this.pending;
	}
	private async drain() {
		while (this.queued) {
			this.queued = false;
			const force = this.forced;
			this.forced = false;
			await this.refresh(force);
		}
	}
}

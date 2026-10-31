const MILESTONES = [25, 50, 75, 100];

export function createDownloadProgressMilestones() {
	let nextIndex = 0;

	return {
		shouldLog(percent: number): boolean {
			let crossed = false;
			while (
				nextIndex < MILESTONES.length &&
				percent >= MILESTONES[nextIndex]
			) {
				nextIndex++;
				crossed = true;
			}
			return crossed;
		},
		reset(): void {
			nextIndex = 0;
		},
	};
}

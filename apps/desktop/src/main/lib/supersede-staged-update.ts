interface SupersedeStagedUpdateOptions {
	stagedVersion: string;
	fetchLatestVersion: () => Promise<string | null>;
	startDownload: (version: string) => void;
	isAbandoned?: () => boolean;
	timeoutMs?: number;
}

export async function supersedeStagedUpdate({
	stagedVersion,
	fetchLatestVersion,
	startDownload,
	isAbandoned = () => false,
	timeoutMs,
}: SupersedeStagedUpdateOptions): Promise<boolean> {
	let hasTimedOut = false;
	const check = fetchLatestVersion().then(
		(latestVersion) => {
			if (
				hasTimedOut ||
				isAbandoned() ||
				latestVersion === null ||
				latestVersion === stagedVersion
			) {
				return false;
			}
			startDownload(latestVersion);
			return true;
		},
		() => false,
	);
	if (timeoutMs === undefined) return check;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const isDownloading = await Promise.race([
		check,
		new Promise<boolean>((resolve) => {
			timer = setTimeout(() => {
				hasTimedOut = true;
				resolve(false);
			}, timeoutMs);
		}),
	]);
	clearTimeout(timer);
	return isDownloading;
}

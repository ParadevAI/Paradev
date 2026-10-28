export function createHostThemePusher<Theme>({
	send,
	onError,
}: {
	send: (hostUrl: string, theme: Theme) => Promise<unknown>;
	onError: (hostUrl: string, error: unknown) => void;
}) {
	const chains = new Map<string, Promise<void>>();
	const pendingPushes = new Map<string, { theme: Theme }>();
	const deliveredThemes = new Map<string, Theme>();

	function push(hostUrl: string, theme: Theme): Promise<void> {
		const pending = { theme };
		pendingPushes.set(hostUrl, pending);
		const pushed = (chains.get(hostUrl) ?? Promise.resolve())
			.then(() => send(hostUrl, theme))
			.then(
				() => {
					if (pendingPushes.get(hostUrl) !== pending) return;
					pendingPushes.delete(hostUrl);
					deliveredThemes.set(hostUrl, theme);
				},
				(error) => {
					if (pendingPushes.get(hostUrl) === pending) {
						pendingPushes.delete(hostUrl);
					}
					deliveredThemes.delete(hostUrl);
					onError(hostUrl, error);
				},
			);
		chains.set(hostUrl, pushed);
		return pushed;
	}

	function expectedTheme(hostUrl: string): Theme | undefined {
		const pending = pendingPushes.get(hostUrl);
		return pending ? pending.theme : deliveredThemes.get(hostUrl);
	}

	return {
		sync(hostUrls: readonly string[], theme: Theme): Promise<void> {
			const connected = new Set(hostUrls);
			for (const hostUrl of [
				...pendingPushes.keys(),
				...deliveredThemes.keys(),
			]) {
				if (connected.has(hostUrl)) continue;
				pendingPushes.delete(hostUrl);
				deliveredThemes.delete(hostUrl);
			}
			const pushes = [...connected]
				.filter((hostUrl) => expectedTheme(hostUrl) !== theme)
				.map((hostUrl) => push(hostUrl, theme));
			return Promise.all(pushes).then(() => {});
		},
	};
}

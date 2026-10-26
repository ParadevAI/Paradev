export function createHostThemePusher<Theme>({
	send,
	onError,
}: {
	send: (hostUrl: string, theme: Theme) => Promise<unknown>;
	onError: (hostUrl: string, error: unknown) => void;
}) {
	const chains = new Map<string, Promise<void>>();
	const pushedThemes = new Map<string, Theme>();

	function push(hostUrl: string, theme: Theme): Promise<void> {
		const pushed = (chains.get(hostUrl) ?? Promise.resolve())
			.then(() => send(hostUrl, theme))
			.then(
				() => {},
				(error) => onError(hostUrl, error),
			);
		chains.set(hostUrl, pushed);
		return pushed;
	}

	return {
		sync(hostUrls: readonly string[], theme: Theme): Promise<void> {
			const connected = new Set(hostUrls);
			for (const hostUrl of pushedThemes.keys()) {
				if (!connected.has(hostUrl)) pushedThemes.delete(hostUrl);
			}
			const pushes = [...connected]
				.filter((hostUrl) => pushedThemes.get(hostUrl) !== theme)
				.map((hostUrl) => {
					pushedThemes.set(hostUrl, theme);
					return push(hostUrl, theme);
				});
			return Promise.all(pushes).then(() => {});
		},
	};
}

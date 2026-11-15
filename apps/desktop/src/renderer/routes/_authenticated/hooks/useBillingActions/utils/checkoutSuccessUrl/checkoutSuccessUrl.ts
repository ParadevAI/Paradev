export function checkoutSuccessUrl(webUrl: string, protocol: string): string {
	const url = new URL("/settings/billing", webUrl);
	url.searchParams.set("success", "true");
	url.searchParams.set("desktop_protocol", protocol);
	return url.toString();
}

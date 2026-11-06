export function checkoutHref(
	webUrl: string,
	family: string,
	yearly: boolean,
): string {
	const url = new URL("/settings/billing", webUrl);
	url.searchParams.set("plan", family);
	url.searchParams.set("interval", yearly ? "yearly" : "monthly");
	return url.toString();
}

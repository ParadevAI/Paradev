/**
 * Where Stripe sends the browser after checkout. `desktop_protocol` lets the
 * web success page deep-link back into the desktop that started checkout.
 */
export function checkoutSuccessUrl(webUrl: string, protocol: string): string {
	const url = new URL("/settings/billing", webUrl);
	url.searchParams.set("success", "true");
	url.searchParams.set("desktop_protocol", protocol);
	return url.toString();
}

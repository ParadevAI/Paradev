import { describe, expect, test } from "bun:test";
import {
	emailImageTickets,
	proxyEmailImages,
	publicUrl,
	serveEmailImage,
} from "./emailImages";

const proxy = (url: string) => `P(${url})`;

describe("proxyEmailImages", () => {
	test("points src, background and CSS url() at the proxy, decoding entities first", () => {
		const html = [
			'<img src="https://t.example/open.gif?u=1&amp;m=2">',
			"<img src='//cdn.example/logo.png'>",
			"<td background=https://cdn.example/bg.jpg>",
			'<div style="background-image:url(&quot;https://cdn.example/hero.jpg&quot;)">',
			"<style>.x{background:url('https://cdn.example/a.png')}</style>",
		].join("");
		const out = proxyEmailImages(html, proxy);
		expect(out).toContain('src="P(https://t.example/open.gif?u=1&m=2)"');
		expect(out).toContain('src="P(https://cdn.example/logo.png)"');
		expect(out).toContain('background="P(https://cdn.example/bg.jpg)"');
		expect(out).toContain("url('P(https://cdn.example/hero.jpg)')");
		expect(out).toContain("url('P(https://cdn.example/a.png)')");
	});

	test("leaves links, data images, cid images and data-src alone", () => {
		const html =
			'<a href="https://x.example">x</a><img src="data:image/png;base64,AA"><img src="cid:a@b"><img data-src="https://lazy.example/a.png">';
		expect(proxyEmailImages(html, proxy)).toBe(html);
	});
});

describe("publicUrl", () => {
	test("refuses private, loopback and link-local hosts and non-web schemes", async () => {
		for (const url of [
			"http://127.0.0.1/a.png",
			"http://10.0.0.5/a.png",
			"http://192.168.1.1/a.png",
			"http://169.254.169.254/latest/meta-data",
			"http://[::1]/a.png",
			"http://localhost:3000/a.png",
			"file:///etc/passwd",
			"https://user:pw@8.8.8.8/a.png",
		]) {
			expect(await publicUrl(url)).toBeNull();
		}
		expect((await publicUrl("https://8.8.8.8/a.png"))?.hostname).toBe(
			"8.8.8.8",
		);
	});
});

describe("serveEmailImage", () => {
	const tickets = emailImageTickets("test-secret-test-secret-test-secret-00");

	test("a forged ticket or a redirect into a private host is not found", async () => {
		expect((await serveEmailImage("nope.nope", tickets.read)).status).toBe(404);
		const token = tickets.sign({ u: "https://8.8.8.8/a.png" });
		const blocked = await serveEmailImage(
			token,
			tickets.read,
			async () => null,
		);
		expect(blocked.status).toBe(404);
	});
});

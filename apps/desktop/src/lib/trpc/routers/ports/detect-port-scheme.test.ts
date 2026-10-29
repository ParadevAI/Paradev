import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { detectPortScheme } from "./detect-port-scheme";

const HOST = "127.0.0.1";

let certDir: string;

beforeAll(() => {
	// A throwaway self-signed certificate, like the ones dev servers use.
	certDir = mkdtempSync(join(tmpdir(), "detect-port-scheme-"));
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			// RSA, not EC: macOS LibreSSL can write an unusable EC key here.
			"rsa:2048",
			"-nodes",
			"-keyout",
			join(certDir, "key.pem"),
			"-out",
			join(certDir, "cert.pem"),
			"-days",
			"1",
			"-subj",
			"/CN=localhost",
		],
		{ stdio: "ignore" },
	);
});

afterAll(() => {
	rmSync(certDir, { recursive: true, force: true });
});

async function listen(server: net.Server): Promise<number> {
	return new Promise((resolve) =>
		server.listen(0, HOST, () =>
			resolve((server.address() as net.AddressInfo).port),
		),
	);
}

async function freePort(): Promise<number> {
	const server = net.createServer();
	const port = await listen(server);
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return port;
}

describe("detectPortScheme", () => {
	test("returns https for a server that speaks TLS", async () => {
		const server = tls.createServer(
			{
				key: readFileSync(join(certDir, "key.pem")),
				cert: readFileSync(join(certDir, "cert.pem")),
			},
			(socket) => socket.end(),
		);
		const port = await listen(server);
		try {
			expect(await detectPortScheme(port, { host: HOST })).toBe("https");
		} finally {
			server.close();
		}
	});

	test("returns http for a plain HTTP server", async () => {
		const server = http.createServer((_req, res) => res.end("ok"));
		const port = await listen(server);
		try {
			expect(await detectPortScheme(port, { host: HOST })).toBe("http");
		} finally {
			server.close();
		}
	});

	test("returns http when a TCP server never answers the handshake", async () => {
		const sockets: net.Socket[] = [];
		const server = net.createServer((socket) => sockets.push(socket));
		const port = await listen(server);
		try {
			expect(await detectPortScheme(port, { host: HOST, timeoutMs: 100 })).toBe(
				"http",
			);
		} finally {
			for (const socket of sockets) socket.destroy();
			server.close();
		}
	});

	test("returns http for a closed port", async () => {
		const port = await freePort();
		expect(await detectPortScheme(port, { host: HOST })).toBe("http");
	});
});

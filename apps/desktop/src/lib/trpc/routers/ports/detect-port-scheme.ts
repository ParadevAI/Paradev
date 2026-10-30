import net from "node:net";
import tls from "node:tls";

export type PortScheme = "http" | "https";

/**
 * Whether the server on a local port speaks TLS, found by trying a TLS
 * handshake. Dev servers often use self-signed certificates, so the
 * certificate is not checked. Anything other than a completed handshake
 * (a plain-HTTP server, a closed port, a timeout) means "http". A plain-HTTP
 * server rejects the handshake at once, so only a server that never answers
 * waits for the timeout; it is generous so a slow forwarded port still counts.
 */
export function detectPortScheme(
	port: number,
	{ host = "localhost", timeoutMs = 2000 } = {},
): Promise<PortScheme> {
	return new Promise((resolve) => {
		const socket = tls.connect({
			host,
			port,
			// Servers that pick a certificate by name need SNI; IPs cannot carry it.
			...(net.isIP(host) ? {} : { servername: host }),
			rejectUnauthorized: false,
		});
		const done = (scheme: PortScheme) => {
			clearTimeout(timer);
			socket.destroy();
			resolve(scheme);
		};
		const timer = setTimeout(() => done("http"), timeoutMs);
		// A real handshake always carries the server's certificate. Checking for
		// it also covers runtimes (Bun) that emit secureConnect for a plain-TCP
		// peer.
		socket.once("secureConnect", () =>
			done(socket.getPeerCertificate()?.raw ? "https" : "http"),
		);
		socket.once("error", () => done("http"));
		socket.once("close", () => done("http"));
	});
}

export function sshFailureHint(stderr: string, target: string): string {
	const check = `Check it in a terminal first: ssh ${target}`;
	if (
		/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(
			stderr,
		)
	) {
		return `The server's host key does not match the one you trusted before. If the machine was rebuilt, run the ssh-keygen -R command ssh printed above, then try again. ${check}`;
	}
	if (/Could not resolve hostname/i.test(stderr)) {
		return `The host name does not resolve. Check the spelling, or that you are on its network or VPN. ${check}`;
	}
	if (/Connection refused/i.test(stderr)) {
		return `Nothing accepts ssh at that address. Check the port and that sshd runs there. ${check}`;
	}
	if (/timed out|No route to host|Network is unreachable/i.test(stderr)) {
		return `The machine did not answer. Check that it is on and that you are on its network or VPN. ${check}`;
	}
	if (/Permission denied/i.test(stderr)) {
		return `The server refused the login. Check the user name, and your key or password. If your key has a passphrase, load it with ssh-add. ${check}`;
	}
	if (/Connection closed by|Connection reset by/i.test(stderr)) {
		return `The server closed the connection before sign-in finished. Servers wait about 2 minutes for a password or MFA code; try again and answer sooner. ${check}`;
	}
	return check;
}

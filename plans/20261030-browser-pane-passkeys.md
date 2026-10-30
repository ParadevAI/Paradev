# Chrome extensions and passkeys in the browser pane

Spec, 2026-10-30. The desktop browser pane installs and runs Chrome extensions the way Chrome
does: install from the Chrome Web Store, click the extension's toolbar button, use its popup.
Password-manager extensions then bring passkeys to the pane. This spec covers why passkeys fail
today, the options, the security work the extension host needs, and the build phases.

## Problem

A site in the browser pane that asks for a passkey never finishes.

Measured in Electron 44.9.3 (the version `apps/desktop` ships) on `https://webauthn.io`:

- `navigator.credentials.create()` for a passkey does not settle after 12 s. The page's own
  4 s `timeout` does not end it. A second call then fails with
  `OperationError: A request is already pending.`
- `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` is `false`.
- `PublicKeyCredential.getClientCapabilities()` reports `hybridTransport: true` and
  `passkeyPlatformAuthenticator: true`, so sites offer passkey sign-in that cannot finish.

Chrome shows its own dialog for a passkey request: the saved passkey, a phone (QR code), or a
security key. Electron has no such dialog. The request waits for a USB security key, and
nothing on screen says so.

Users keep passkeys in iCloud Keychain, Google Password Manager (in Chrome), and
password-manager extensions (1Password, Bitwarden, Dashlane, Proton Pass). The pane can reach
none of them today, and it runs no third-party Chrome extensions at all.

## Options

| | A. Chrome extensions | B. Native Touch ID | C. System passkey sheet | D. Sign in with Chrome, import session |
|---|---|---|---|---|
| What the user gets | Any Chrome extension, installed from the Web Store. Passkeys already saved in 1Password, Bitwarden and others work on any site. | New passkeys made inside the pane, stored in this Mac's Secure Enclave. Not synced, not shared with Chrome or iCloud. | The macOS passkey sheet: iCloud Keychain, phone, 1Password provider, security keys. | Any passkey works, because Chrome does the sign-in. The pane gets the cookies after. |
| Mechanism | `electron-chrome-extensions@4.10.0` (MIT, 1 dependency) adds the `chrome.action`, `chrome.windows` and tab APIs that Electron's own extension support lacks. `electron-chrome-web-store@0.13.0` (MIT) installs and updates from the Chrome Web Store. | `app.configureWebAuthn({ touchID: { keychainAccessGroup } })`, Electron 41.5+, plus the `select-webauthn-account` session event to pick an account. | `ASAuthorizationWebBrowserPublicKeyCredentialManager` in a native module, and a WebAuthn shim in the page. | `chrome-cookie-import.ts`, which exists today. |
| Blocker | Security work below. | Needs the `keychain-access-groups` entitlement and an embedded provisioning profile in the signed build. An unsigned build logs `Touch ID authenticator unavailable because keychain-access-group entitlement is missing or incorrect`. The entitlement without the profile stops the app from launching. | Needs Apple's managed `com.apple.developer.web-browser.public-key-credential` entitlement. Apple says to add it only if the app acts as the user's web browser, and only the Account Holder can request it ([Apple docs](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.web-browser.public-key-credential)). Electron has no hook to hand a request to it. | Manual. Sessions bound to the device (Chrome DBSC) do not carry over. |
| Platforms | macOS, Windows, Linux | macOS only | macOS only | Every platform with Chrome |

## Decision

1. **A, Chrome extensions, with both packages pinned to the exact versions above.** It reaches
   the passkeys users already have, on every platform, with no Apple gate, and it gives the pane
   the Chrome extension flow users expect.
2. **D, as the fallback, after A.** When a passkey request in the pane has no extension to
   answer it, the pane says so and offers to sign in with Chrome and import the session.
3. **B, when the release build has a provisioning profile.** It changes nothing for users until
   the signed build carries the entitlement, so it waits on the release setup, not on code.
4. **C is out of scope.** Apple limits its entitlement to apps that act as the user's web
   browser, and Electron gives no place to plug it in.

## 1Password under Electron 44

A prototype loaded 1Password 8.12.37 into Electron 44.9.3 three ways:

| | Electron alone | `electron-chrome-extensions` as shipped | Plus a `browser` alias |
|---|---|---|---|
| Service worker starts | No: `reading 'onClicked'` | No: `reading 'WINDOW_ID_NONE'` | Yes: `Finished initializing 1Password` |
| Content script hooks WebAuthn | Yes | Yes | Yes |
| Toolbar popup | None | Opens, blank spinner | Opens, signed-out click opens the welcome tab |

Chromium 152 gives extension contexts their own `browser` namespace, separate from `chrome`.
1Password's webextension polyfill uses `browser`; `electron-chrome-extensions` patches only
`chrome`. So the extension host sets `browser` to the patched `chrome` in extension contexts.
With that alias, 1Password still lacks `chrome.offscreen` and `chrome.webRequestAuthProvider`.
A signed-in passkey ceremony is unproven until a user signs in to 1Password in the pane.

## Security

Extensions can read and change every page in the pane, as in Chrome. The host must not widen
that to the app itself, and must not trust an extension it did not verify.

| Risk | Finding | Handling |
|---|---|---|
| Extensions see the app | The app UI and the pane share the session `persist:superset` (`apps/desktop/src/main/windows/main.ts`, both `<webview>` creators). An extension with `webRequest` would see the app's own API calls and auth headers. | The pane moves to its own session, `persist:browser`. Third-party extensions load only there. |
| Websites reach extension APIs | The `chrome.*` bridge loads only into `chrome-extension://` pages and service workers (`electron-chrome-extensions` `chrome-extension-api.preload.js`). | None needed. |
| Tampered download | `electron-chrome-web-store` reads the CRX3 header and checks that the declared ID matches the public key, but never verifies the signature. HTTPS to Google is the only guard. | The host verifies the CRX3 `sha256_with_rsa` signature before it unpacks, and refuses CRX2. |
| No malware kill switch | Chrome turns off extensions that Google flags as malware. The package only checks for updates every 5 h. | A visible list of installed extensions with remove. The package's `allowlist` and `denylist` stay available. |
| Main process trusts the sender | The IPC router takes the extension ID from the message, not from the sender frame, and the package's bridge object is reachable in every extension context. One installed extension can call the polyfilled APIs (tabs, windows, context menus, toolbar actions) as another extension. Chromium-enforced APIs (`cookies`, `webRequest`, `scripting`) are not affected. | Derive the extension ID from the sender (frame origin or service-worker scope) in a patch, and report upstream. Until then, install only extensions you trust, as in Chrome. |
| Update while loading | The package's updater checks at start, removes the old version and deletes its files while the old service worker may still be loading them (1Password failed with `SyntaxError: Unexpected end of input`). | The first update check runs 5 minutes after start, then every 5 hours. |
| Supply chain | One maintainer. `electron-chrome-extensions@4.10.0` shipped 2026-10-25. | Exact versions, lockfile hashes, diff review on every bump. |

## Session move

`APP_PARTITION` (`persist:superset`) and `BROWSER_PARTITION` (`persist:browser`) live in
`apps/desktop/src/shared/constants.ts`. Every caller uses the constants; no raw partition string
stays in the code.

On first start after the move, pane cookies copy once from `persist:superset` to
`persist:browser`, so users stay signed in to sites. Site `localStorage` and IndexedDB do not
move; a site that keeps its login there asks for sign-in once. When every cookie copied, the
same step clears those sites (cookie domains and pane history origins, never Paradev's own
domains) from `persist:superset`, so "Clear browsing data" reaches all pane data again. The step
runs once and is safe to run again.

## Phases

1. **Session move.** Constants, every caller moved, the one-time cookie copy.
2. **Extension host.** `electron-chrome-extensions` on `persist:browser` with the `browser`
   alias, pane web contents registered as tabs, extension popups and new tabs mapped to pane
   operations. `electron-chrome-web-store` with the signature check, extensions stored under the
   app's user data, loaded at start, updated in the background.
3. **Toolbar and management UI.** Extension buttons in the pane toolbar, popups, an installed
   list with remove. Built from 2-3 variants and a designer's pick.
4. **Passkey fallback (D).**
5. **Touch ID (B)**, when the release build has a provisioning profile.

## Done means

- The pane installs an extension from the Chrome Web Store, shows its toolbar button, and opens
  its popup.
- 1Password, installed and signed in, completes a passkey sign-in on `https://webauthn.io` in
  the pane.
- The app UI session has no third-party extension loaded.
- A tampered CRX is refused.
- Users signed in to a site in the pane before the session move are still signed in after it.
- With no extension that handles passkeys, a passkey request ends with a message in the pane,
  not a hang.

## Test seams

- The cookie copy: one test that a cookie in `persist:superset` is in `persist:browser` after
  the copy, and a second run adds nothing.
- The signature check: one test that a CRX with a flipped byte is refused and the real one is
  accepted.
- Extensions and passkeys: end to end in the running app (`cdp-verification` skill).

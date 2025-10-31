# Desktop App Distribution Plan

## Current State

### What We Have
- **electron-builder** configured (`electron-builder.ts:1`)
- **Build scripts** in place (`apps/desktop/package.json:20-23`)
  - `bun run build` - Local build
  - `bun run release` - Publish build
- **Platform targets** configured:
  - **macOS**: ZIP, DMG, DIR
  - **Linux**: AppImage, DEB, Pacman, FreeBSD, RPM
  - **Windows**: ZIP, Portable
- **Icons** ready (`src/resources/build/icons/`)
- **electron-vite** for app compilation
- **Basic CI** (lint, typecheck, build)

### What's Missing
- Auto-update infrastructure
- Code signing & notarization
- Release automation via CI/CD
- Version management strategy
- Distribution hosting
- Update server/CDN
- Security considerations

---

## Distribution Strategy

### Phase 1: Manual Releases (Quickest Path to Distribution)

#### 1.1 Improve electron-builder Configuration

**File**: `apps/desktop/electron-builder.ts`

**Add to configuration:**
```typescript
export default {
  // ... existing config

  // Compression & artifacts
  compression: "maximum",

  // File associations (optional)
  fileAssociations: [
    {
      ext: "superset",
      name: "Superset Workspace",
      role: "Editor"
    }
  ],

  // macOS specific
  mac: {
    // ... existing
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: false // Enable later with credentials
  },

  // macOS DMG
  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: "link",
        path: "/Applications"
      }
    ]
  },

  // Windows specific
  win: {
    // ... existing
    target: [
      {
        target: "nsis",
        arch: ["x64", "arm64"]
      },
      "zip",
      "portable"
    ]
  },

  // NSIS installer options
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: displayName
  },

  // Linux AppImage
  appImage: {
    license: "LICENSE"
  }
} satisfies Configuration;
```

**Action items:**
- Create `apps/desktop/build/entitlements.mac.plist` for macOS entitlements
- Add more granular build targets as needed
- Consider adding Windows signing stub (for later)

#### 1.2 Version Management

**Strategy**: Use semantic versioning with manual bumps

**Add to root `package.json` scripts:**
```json
{
  "scripts": {
    "version:patch": "bun run version:bump patch",
    "version:minor": "bun run version:bump minor",
    "version:major": "bun run version:bump major",
    "version:bump": "tsx scripts/bump-version.ts"
  }
}
```

**Create**: `scripts/bump-version.ts`
- Bump version in `apps/desktop/package.json`
- Update changelog
- Create git tag

#### 1.3 Manual Release Process

**Steps:**
1. `bun run version:patch` (or minor/major)
2. Commit version bump
3. `cd apps/desktop && bun run prebuild`
4. `bun run build` (or per-platform: `bun run build --mac`, `--win`, `--linux`)
5. Test installers locally
6. Upload to GitHub Releases manually
7. Push git tag

**Pros:**
- Simple, no infrastructure needed
- Can start immediately
- Full control over each release

**Cons:**
- Manual work
- Prone to human error
- No automated testing of installers

---

### Phase 2: GitHub Releases + Auto-Updates

#### 2.1 GitHub Releases via CI/CD

**Create**: `.github/workflows/release-desktop.yml`

```yaml
name: Release Desktop App

on:
  push:
    tags:
      - 'desktop-v*'

jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen

      - name: Build desktop app
        run: |
          cd apps/desktop
          bun run prebuild
          bun run build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: apps/desktop/dist/**/*

      - name: Release
        uses: softprops/action-gh-release@v1
        with:
          files: apps/desktop/dist/**/*
          draft: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Trigger release:**
```bash
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

#### 2.2 Auto-Update Configuration

**Add to `electron-builder.ts`:**
```typescript
export default {
  // ... existing

  publish: {
    provider: "github",
    owner: "your-org",
    repo: "superset",
    releaseType: "release" // or "draft"
  }
} satisfies Configuration;
```

**Install auto-updater:**
```bash
cd apps/desktop
bun add electron-updater
```

**Create**: `apps/desktop/src/main/lib/auto-updater.ts`

```typescript
import { autoUpdater } from "electron-updater";
import { app, dialog } from "electron";

export function initAutoUpdater() {
  // Disable auto-download
  autoUpdater.autoDownload = false;

  // Check for updates on startup (after 3 seconds)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);

  // When update is available
  autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox({
      type: "info",
      title: "Update Available",
      message: `Version ${info.version} is available. Do you want to download it now?`,
      buttons: ["Download", "Later"]
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  // Download progress
  autoUpdater.on("download-progress", (progress) => {
    // Send to renderer process to show progress bar
    // mainWindow.webContents.send("download-progress", progress.percent);
  });

  // Update downloaded
  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox({
      type: "info",
      title: "Update Ready",
      message: "Update downloaded. Restart the app to apply the update?",
      buttons: ["Restart", "Later"]
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
}
```

**Import in main process** (`src/main/index.ts`):
```typescript
import { initAutoUpdater } from "./lib/auto-updater";

app.whenReady().then(() => {
  // ... existing setup

  if (!app.isPackaged) {
    // Skip auto-updater in development
    return;
  }

  initAutoUpdater();
});
```

#### 2.3 Update Server Options

**Option A: GitHub Releases** (Free)
- Simple, no infrastructure
- Uses `electron-updater` + `provider: "github"`
- Rate limits may apply

**Option B: Custom CDN**
- Full control
- Better performance
- Requires setup (S3 + CloudFront, etc.)

**Option C: Electron Release Server**
- Self-hosted
- More features (channels, statistics)
- Requires maintenance

**Recommended**: Start with GitHub Releases (Option A)

---

### Phase 3: Code Signing & Notarization

#### 3.1 macOS Code Signing

**Requirements:**
- Apple Developer account ($99/year)
- Developer ID Application certificate
- Developer ID Installer certificate

**Setup:**
1. Create certificates in Apple Developer portal
2. Download and install in Keychain
3. Set environment variables in CI:
   - `CSC_LINK` (base64-encoded .p12 file)
   - `CSC_KEY_PASSWORD` (certificate password)
   - `APPLE_ID` (for notarization)
   - `APPLE_APP_SPECIFIC_PASSWORD` (app-specific password)
   - `APPLE_TEAM_ID`

**Update CI workflow:**
```yaml
- name: Build desktop app (macOS)
  if: matrix.os == 'macos-latest'
  run: |
    cd apps/desktop
    bun run prebuild
    bun run build
  env:
    CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
    CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

**Update `electron-builder.ts`:**
```typescript
mac: {
  // ... existing
  hardenedRuntime: true,
  gatekeeperAssess: false,
  notarize: {
    teamId: process.env.APPLE_TEAM_ID
  }
}
```

#### 3.2 Windows Code Signing

**Requirements:**
- Code signing certificate (from DigiCert, Sectigo, etc.)
- Certificate file (.pfx or .p12)

**Setup:**
1. Purchase certificate
2. Set environment variables in CI:
   - `WIN_CSC_LINK` (base64-encoded .pfx file)
   - `WIN_CSC_KEY_PASSWORD`

**Update CI workflow:**
```yaml
- name: Build desktop app (Windows)
  if: matrix.os == 'windows-latest'
  run: |
    cd apps/desktop
    bun run prebuild
    bun run build
  env:
    WIN_CSC_LINK: ${{ secrets.WIN_CERT_P12_BASE64 }}
    WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
```

#### 3.3 Linux Signing

**Not typically required**, but can sign AppImage:
- Use GPG signature
- Or sign with private key

---

### Phase 4: Advanced Distribution

#### 4.1 Release Channels

**Implement channels**: `stable`, `beta`, `alpha`

**Strategy:**
- `stable`: Production releases (git tags: `v1.0.0`)
- `beta`: Pre-release testing (git tags: `v1.0.0-beta.1`)
- `alpha`: Nightly/development (git tags: `v1.0.0-alpha.1`)

**Update electron-builder.ts:**
```typescript
publish: [
  {
    provider: "github",
    owner: "your-org",
    repo: "superset",
    channel: process.env.RELEASE_CHANNEL || "stable"
  }
]
```

**Allow users to switch channels** in app settings.

#### 4.2 Crash Reporting

**Options:**
- Sentry
- BugSnag
- Electron's built-in crash reporter

**Example with Sentry:**
```bash
bun add @sentry/electron
```

```typescript
// src/main/index.ts
import * as Sentry from "@sentry/electron/main";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN"
});
```

#### 4.3 Analytics

**Options:**
- Posthog (privacy-friendly)
- Mixpanel
- Custom solution

**Privacy considerations:**
- Make analytics opt-in
- Anonymize data
- Respect Do Not Track

#### 4.4 App Store Distribution

**macOS App Store:**
- Requires sandboxing
- More restrictive entitlements
- May conflict with git/terminal features (node-pty)
- **Recommendation**: Skip unless necessary

**Microsoft Store:**
- Requires different packaging (MSIX)
- Add to `electron-builder.ts`:
  ```typescript
  win: {
    target: ["nsis", "appx"]
  },
  appx: {
    displayName: "Superset",
    publisherDisplayName: "Your Name",
    identityName: "YourCompany.Superset"
  }
  ```

**Linux stores:**
- Snap Store
- Flathub
- Requires separate packaging

---

## Security Considerations

### 1. Dependency Security
- Run `bun audit` regularly
- Keep electron and dependencies updated
- Use Dependabot for automated updates

### 2. Content Security Policy
Already likely in place, but ensure CSP headers are set in renderer process.

### 3. Native Module Security
- `node-pty` requires native compilation
- Ensure it's rebuilt for correct Electron version
- Test on all platforms after updates

### 4. Update Security
- Use HTTPS for update server
- Verify signatures of updates
- electron-updater handles this by default with code-signed apps

### 5. Secrets Management
- Never commit certificates or keys
- Use GitHub Secrets for CI/CD
- Rotate credentials regularly

---

## Testing Strategy

### 1. Pre-Release Testing
**Create checklist:**
- [ ] Install on clean macOS system
- [ ] Install on clean Windows system
- [ ] Install on clean Linux system (Ubuntu, Fedora)
- [ ] Test auto-updater (from previous version)
- [ ] Verify code signature (macOS: `codesign -vvv -d`, Windows: right-click properties)
- [ ] Test all major features (terminal, workspace, etc.)
- [ ] Check for console errors
- [ ] Verify permissions (file access, etc.)

### 2. Beta Testing Program
- Recruit beta testers
- Use `beta` release channel
- Collect feedback via Discord/GitHub
- Monitor crash reports

### 3. Automated Testing
**Add to CI:**
```yaml
- name: Test app launch (smoke test)
  run: |
    cd apps/desktop
    xvfb-run --auto-servernum bun run start &
    sleep 5
    pkill -f electron
```

---

## Rollout Plan

### Week 1: Foundation
- [ ] Enhance `electron-builder.ts` with improved config
- [ ] Create version bump script
- [ ] Create entitlements file for macOS
- [ ] Test local builds on all platforms
- [ ] Document release process

### Week 2: Automation
- [ ] Create `.github/workflows/release-desktop.yml`
- [ ] Set up GitHub Releases
- [ ] Test CI build on all platforms
- [ ] Add auto-updater code
- [ ] Test update flow locally

### Week 3: Code Signing
- [ ] Purchase/set up certificates (macOS, Windows)
- [ ] Configure CI secrets
- [ ] Add signing to CI workflow
- [ ] Test signed builds
- [ ] Verify notarization (macOS)

### Week 4: Launch
- [ ] Create v0.1.0 release
- [ ] Publish release notes
- [ ] Announce on website/social media
- [ ] Monitor for issues
- [ ] Collect feedback

### Ongoing
- [ ] Set up crash reporting
- [ ] Add analytics (opt-in)
- [ ] Implement beta channel
- [ ] Improve update UX
- [ ] App store distribution (if needed)

---

## Costs

| Item | Cost | Notes |
|------|------|-------|
| Apple Developer Account | $99/year | Required for macOS notarization |
| Windows Code Signing | $100-400/year | From DigiCert, Sectigo, etc. |
| Crash Reporting (Sentry) | $0-29+/month | Free tier available |
| CDN (if not using GitHub) | $0-50+/month | AWS S3 + CloudFront |
| **Total (Year 1)** | **~$200-600** | Minimum: $199 (Apple + Win cert) |

---

## Resources

### Documentation
- [electron-builder docs](https://www.electron.build/)
- [electron-updater docs](https://www.electron.build/auto-update)
- [Apple notarization guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows code signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)

### Tools
- [Electron Forge](https://www.electronforge.io/) (alternative to electron-builder)
- [Electron Release Server](https://github.com/ArekSredzki/electron-release-server)
- [update-electron-app](https://github.com/electron/update-electron-app) (simpler updater)

### Community
- [Electron Discord](https://discord.gg/electron)
- [electron-builder issues](https://github.com/electron-userland/electron-builder/issues)

---

## Recommended Starting Point

**For fastest time-to-distribution:**

1. **Enhance config** (1-2 hours)
   - Update `electron-builder.ts` with NSIS, DMG settings
   - Create entitlements file

2. **Manual release** (1 hour)
   - Build locally: `cd apps/desktop && bun run prebuild && bun run build`
   - Test installers
   - Upload to GitHub Releases

3. **Get feedback** (1 week)
   - Share with early adopters
   - Collect bug reports
   - Iterate

4. **Automate** (1-2 days)
   - Set up CI workflow
   - Add auto-updater
   - Test end-to-end

5. **Sign** (2-3 days)
   - Get certificates
   - Configure signing
   - Test signed builds

**Total estimated time: 1-2 weeks** for a production-ready distribution setup.

---

## Questions to Answer

Before proceeding, clarify:

1. **Target audience**: Who will use this? (developers, teams, enterprises)
2. **Platform priority**: macOS-first? Windows? Linux?
3. **Update frequency**: Weekly? Monthly? Ad-hoc?
4. **Budget**: Can you afford code signing certificates?
5. **Privacy**: Will you collect analytics? Crash reports?
6. **Distribution model**: Free? Paid? Freemium?
7. **Support model**: Community? Email? Discord?

These decisions will affect the implementation details.

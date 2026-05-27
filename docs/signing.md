# Code signing & notarization

NovexDB's release CI builds **unsigned** installers by default. They
work — auto-updates work, the app launches — but first-run friction is
worse:

- **macOS**: Gatekeeper shows *"NovexDB cannot be opened because the
  developer cannot be verified"*. Users right-click → Open → Open to
  bypass.
- **Windows**: SmartScreen says *"Windows protected your PC"*. Users
  click *More info* → *Run anyway*.

Signed builds remove both warnings. Here's how to flip them on.

## macOS — Developer ID + notarization

### One-time setup

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/) — **$99/year**.
2. In **Xcode → Settings → Accounts**, sign in with your Apple ID, then
   click **Manage Certificates → +** and create a **Developer ID
   Application** certificate.
3. Open **Keychain Access**, find the new cert, right-click → **Export…**.
   Save it as `cert.p12` with a strong password.
4. Generate an **app-specific password** at
   [appleid.apple.com → Sign-In and Security → App-Specific Passwords](https://appleid.apple.com).
   Save the 19-character string somewhere safe.
5. Find your **Team ID** at
   [developer.apple.com/account](https://developer.apple.com/account) →
   *Membership details*. It's a 10-character alphanumeric.

### GitHub Secrets (for CI)

Add these in **Settings → Secrets and variables → Actions → New
repository secret** on `novexdb/novexdb`:

| Secret name | Value |
| --- | --- |
| `CSC_LINK` | base64-encoded `cert.p12` — `base64 -i cert.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | the password you chose during export |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the 19-character app-specific password |
| `APPLE_TEAM_ID` | your 10-character Team ID |

### Uncomment the signing block

In [`electron-builder.yml`](../electron-builder.yml), find the `mac:`
section and uncomment:

```yaml
mac:
  identity: 'Developer ID Application: Your Name (TEAMID)'
  hardenedRuntime: true
  gatekeeperAssess: false
  notarize:
    teamId: TEAMID
```

Replace `Your Name (TEAMID)` with the exact Common Name on the
certificate, and `TEAMID` with your Team ID.

### Pass the secrets to the build step

In [`.github/workflows/release.yml`](../.github/workflows/release.yml),
the `Package + publish` step needs the secrets as env vars:

```yaml
- name: Package + publish
  run: ${{ matrix.cmd }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Next push to `main` produces signed + notarized DMGs.

## Windows — code-signing certificate

### One-time setup

1. Buy an OV or EV code-signing cert from a CA (Sectigo, DigiCert,
   SSL.com) — **$200–$700/year**. OV is fine for most projects; EV
   bypasses SmartScreen reputation immediately but requires a hardware
   token and costs more.
2. Export the cert as a `.pfx` file with a password.

### GitHub Secrets

| Secret name | Value |
| --- | --- |
| `CSC_LINK` (Windows-only — see note) | base64-encoded `.pfx` |
| `CSC_KEY_PASSWORD` | the password |

> **Note**: `CSC_LINK` clashes with the macOS one. If you're signing
> both platforms, rename the Windows secrets (e.g. `WIN_CSC_LINK`) and
> map them in the workflow's Windows step only. The Apple env vars
> won't be set on Windows runners anyway, so the macOS values won't
> bleed through.

### Uncomment the signing block

In [`electron-builder.yml`](../electron-builder.yml), find the `win:`
section and uncomment:

```yaml
win:
  certificateFile: resources/win-cert.pfx     # not needed if CSC_LINK is set
  signingHashAlgorithms:
    - sha256
  rfc3161TimeStampServer: http://timestamp.digicert.com
```

If you're using `CSC_LINK` (recommended), drop the `certificateFile`
line — electron-builder will read the cert from the env var directly.

## Linux

No signing needed. AppImages and `.deb`s install without warnings
once the user explicitly enables third-party software.

## Verification

After flipping signing on, you can confirm the artifacts are signed:

```bash
# macOS
codesign --verify --deep --strict --verbose=2 /Applications/NovexDB.app
spctl --assess --type execute /Applications/NovexDB.app
# → both should return "accepted (with notarized Developer ID)"

# Windows (PowerShell)
Get-AuthenticodeSignature .\NovexDB-Setup.exe
# → Status should be "Valid", SignerCertificate filled in
```

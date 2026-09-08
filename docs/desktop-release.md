# Desktop downloads

The website downloads installers from the latest published GitHub release in
`tobyyeung/tachotasks`. The filenames in `downloads.js` match `package.json`:

- Windows: `Tacho-Tasks-Setup.exe` (NSIS installer)
- macOS: `Tacho-Tasks.dmg`
- Linux: `Tacho-Tasks.AppImage`

Build Windows locally with `npm run build:electron -- --win --x64 --publish never`.
The installer is written to `release/`. If Electron's runtime is already installed,
append `--config.electronDist=node_modules/electron/dist` to reuse it.

To release, update the package version and lockfile together, commit the changes,
and push a matching `vX.Y.Z` tag. The desktop workflow builds all three platforms
and publishes their installers and updater metadata to GitHub Releases. A manual
workflow run saves downloadable build artifacts without publishing a release.
Deploy the web build (`dist/`) through the website's normal hosting process.
Website links need a published release; workflow artifacts alone are insufficient.

# Desktop authentication

Firebase saves the login in Chromium local storage at the stable
`http://localhost:51893` origin. Startup waits for Firebase to restore that login.
Only one desktop instance runs at a time; failure to bind the port reports an error
instead of switching to a different origin. Chromium storage is flushed on quit.

The tutorial is suppressed in Electron at its entry point and automatic triggers.
This does not change account onboarding settings shared with the website.
Calendar access-token expiry does not sign the user out of Firebase or launch
automatic consent windows; Calendar reconnection requires an explicit action.

For a live account smoke test: sign in once, fully quit, reopen, and confirm the
same account returns without a login or tutorial. Repeat after a cloud pull, then
explicitly sign out and reopen to confirm the login screen returns.

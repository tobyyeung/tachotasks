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

## In-app updates (v1.20.0 and later)

Installed desktop builds check at startup and every four hours. Updates download
in the background. Settings shows the installed version, download progress, a
manual check/retry button, and Restart to update when ready. A small notification
also offers Restart to update or Later from any view. Later keeps the update
ready; quitting normally installs it automatically. Restart waits for queued
task writes and flushes SQLite and Chromium storage first.

The bottom-right version badge uses the packaged application version in Electron
and the package version injected by Vite on the web. Development builds do not
download or install updates. Releases still need the installer, blockmap, and
latest.yml uploaded together; the app downloads these automatically.

The v1.19.4 and v1.19.5 installers already check once on startup and install a
downloaded update on quit, so they can receive this updater UI without a manual
installer download. Older builds using the discontinued generic release feed
may need one manual upgrade.

## Account persistence

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

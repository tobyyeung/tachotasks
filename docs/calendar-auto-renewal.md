# Activate automatic Google Calendar renewal

The implementation is prepared for `https://tasks.tobyyeung.com` and Firebase project `tachotasks-d7c56`. It is **disabled until the backend is deployed**. Existing click-to-reconnect behavior continues while disabled.

After activation, use **Settings → Connect Google Calendar** once. The browser sends Google's one-time authorization code to the authenticated backend. The backend stores encrypted credentials and renews short-lived access tokens when calendar requests need them. Reloading the website recovers the connection without a popup. Renewal is on demand, not a scheduled job while the site is closed.

## 1. Configure Google and Firebase

- The Firebase project must have the Blaze plan to deploy Functions. This can incur usage charges. See [Firebase's deployment requirements](https://firebase.google.com/docs/functions/manage-functions).
- Enable the Google Calendar API in the Google Cloud project that owns the OAuth client.
- Create or use a **Web application** OAuth client. Add `https://tasks.tobyyeung.com` as an authorized JavaScript origin and authorized redirect URI, without a trailing slash. The popup code flow exchanges the code using the calling page's origin; see [Google's code-model guide](https://developers.google.com/identity/oauth2/web/guides/use-code-model).
- Configure the consent screen for `openid`, `email`, and `https://www.googleapis.com/auth/calendar.readonly`. Complete any Google verification required for the intended audience.
- External apps left in **Testing** receive refresh tokens that expire after seven days for Calendar scopes. Production status avoids that testing limit, but Google can still revoke or expire access. See [Google's token-expiration documentation](https://developers.google.com/identity/protocols/oauth2).

## 2. Install and authenticate deployment tools

Run from the repository root using Node 22:

```powershell
npm install -g firebase-tools
firebase login
npm --prefix functions ci
```

Create `functions/.env.tachotasks-d7c56` (ignored by Git) with the **public client ID**:

```dotenv
CALENDAR_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
CALENDAR_ALLOWED_ORIGINS=https://tasks.tobyyeung.com
```

Set the client secret through the interactive CLI prompt. Do not put it in browser JavaScript, Git, or chat:

```powershell
firebase functions:secrets:set CALENDAR_CLIENT_SECRET --project tachotasks-d7c56
```

Generate an encryption key and pipe it directly into Secret Manager without displaying it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | firebase functions:secrets:set CALENDAR_TOKEN_KEY --data-file - --project tachotasks-d7c56
```

Keep this encryption key stable. Replacing it without migrating stored credentials makes existing connections unreadable. Firebase injects both secrets only into the backend; see [Firebase secret configuration](https://firebase.google.com/docs/functions/config-env).

## 3. Protect storage and deploy

Compare the existing project's Firestore rules with `firestore.rules` before applying them. The provided rules permit only each user's existing task collections and deny browser access to `_calendarCredentials`. Do not retain a broader wildcard allow rule that also matches the credential collection: Firestore allow rules are additive.

```powershell
firebase deploy --only firestore:rules --project tachotasks-d7c56
firebase deploy --only functions:calendar --project tachotasks-d7c56
```

The calendar codebase includes the HTTP function `calendarAuth` and an account-deletion cleanup trigger. Confirm deployment succeeds before enabling the browser integration. Deployment is independent of wherever the static website is hosted.

## 4. Enable the website integration

In `js/api/calendar-backend-config.js`, set `clientId` to the same public OAuth client ID and set `enabled: true`. Confirm the function URL matches the deployed endpoint. Deploy the updated static website through its existing hosting process.

Open Settings and click **Connect Google Calendar**, using the same Google account as your TachoTasks login. Approve Calendar access. Future access-token renewals run through the backend without Google windows.

**Stop automatic renewal** deletes the backend's stored credentials while retaining cached events. It does not sign you out of TachoTasks. To revoke the Google grant itself, remove the app in your [Google account connections](https://myaccount.google.com/connections). Deleting a Firebase user also deletes their stored calendar credentials.

## Verification before calling activation complete

- Run `node --test tests/*.test.cjs`. Tests use mocked Google/Firebase services, not live user credentials.
- Sign in and connect once on the live site. Confirm calendars load.
- Reload and confirm calendars load without a popup.
- Leave the app open beyond access-token expiry and confirm calendar requests renew successfully without a popup.
- Stop automatic renewal and confirm refresh asks for an explicit reconnect while cached events stay visible.
- Sign out or switch accounts during a request and confirm no previous account's calendar token is accepted by the UI.

Transient backend outages retain stored credentials and do not initiate interactive login. Revoked grants require a manual reconnect. No client secret or refresh token should appear in browser storage or HTTP responses.

## Rollback

Set `enabled: false` and redeploy the static website to restore manual reconnect. This does not delete stored backend connections; disconnect first if they should be removed. Existing task data and cloud task synchronization use the same Firebase project and are separate from calendar renewal.

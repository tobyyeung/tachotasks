// Enable after deploying calendarAuth and setting the matching OAuth client ID.
// These values are public. Never put an OAuth client secret or refresh token here.
export const calendarBackendConfig = {
  enabled: false,
  url: 'https://us-central1-tachotasks-d7c56.cloudfunctions.net/calendarAuth',
  clientId: '179662622348-oh6gk1g83fd4qeol579fc4fedockrj6o.apps.googleusercontent.com'
};

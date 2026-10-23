// Google sign-in for sync. The client ID is public (it identifies the app, it is not a password), so it
// lives in the code. While it is empty the sync card says sync is not set up yet and nothing runs.
// The end-to-end tests build with a stand-in ID (VITE_GOOGLE_CLIENT_ID) and a fake Google.
const BUILT_IN_CLIENT_ID = '';
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || BUILT_IN_CLIENT_ID;

/** Only the hidden app folder in the learner's own Drive: the app cannot see any other file. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const SYNC_FILE_NAME = 'courseify-sync.json.gz';

export function syncConfigured(): boolean {
  return GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}

// Imported first in main.ts: Google sends the learner back with the sign-in in the address
// (#access_token=...). It has to be read and removed before the router looks at the address.
import { takeRedirect } from './auth.ts';

takeRedirect();

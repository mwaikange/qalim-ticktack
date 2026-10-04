import { confirmEmail } from './confirmation';

export function passwordResetRedirect(origin: string) {
  return new URL('/auth/reset-password', origin).toString();
}
// Dashboard recovery emails use the Supabase Site URL rather than redirectTo.
export function recoveryCallbackRedirect(href: string): string | null {
  const url = new URL(href);
  if (new URLSearchParams(url.hash.slice(1)).get('type') !== 'recovery') return null;
  return passwordResetRedirect(url.origin) + url.search + url.hash;
}

export async function preparePasswordReset(auth: Parameters<typeof confirmEmail>[0], href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('error') || url.searchParams.has('error')) {
    throw new Error(hash.get('error_description') || url.searchParams.get('error_description') || 'This reset link has expired. Request a new one from the app.');
  }
  if (!url.searchParams.get('code') && !(hash.get('type') === 'recovery' && hash.get('access_token'))) {
    throw new Error('Open the password reset link from your email. If it has expired, request a new one from the app.');
  }
  await confirmEmail(auth, href);
}

type PasswordAuth = { updateUser: (attributes: {password: string}) => Promise<{error: {message: string} | null}> };
export async function savePassword(auth: PasswordAuth, password: string, confirmation: string) {
  if (password.length < 8 || password.length > 128) throw new Error('Use a password between 8 and 128 characters.');
  if (password !== confirmation) throw new Error('The passwords do not match.');
  const {error} = await auth.updateUser({password});
  if (error) throw new Error(error.message);
}

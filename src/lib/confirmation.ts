export function confirmationRedirect(origin: string) {
  return new URL('/auth/confirm', origin).toString();
}
type Auth = {
  exchangeCodeForSession: (code: string) => Promise<{error: {message: string} | null}>;
  getUser: () => Promise<{data: {user: {id: string} | null}; error: {message: string} | null}>;
};
export async function confirmEmail(auth: Auth, href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('error') || url.searchParams.has('error')) {
    throw new Error(hash.get('error_description') || url.searchParams.get('error_description') || 'This confirmation link has expired. Request a new link or try signing in.');
  }
  const code = url.searchParams.get('code');
  if (code) {
    const {error} = await auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
  }
  // Supabase initializes its session from the standard email link's URL fragment.
  // getUser waits for initialization and validates the resulting user with Auth.
  const {data,error} = await auth.getUser();
  if (error || !data.user) throw new Error('This link is missing, expired, or already used. Try signing in; if your email is still unconfirmed, request a new link.');
}

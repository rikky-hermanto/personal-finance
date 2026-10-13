import { supabase } from '@/lib/supabase';

/** Attach the current Supabase access token without replaying mutations. */
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Please sign in again.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    const latest = await supabase.auth.getSession();
    if (latest.data.session?.access_token === token) {
      await supabase.auth.signOut();
    }
  }
  return response;
}

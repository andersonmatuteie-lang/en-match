// Sustituto local de supabase-js para probar las Edge Functions sin red.
// Cada prueba instala su cliente falso en globalThis.__fakeSupabase.
// deno-lint-ignore-file no-explicit-any
export function createClient(url: string, key: string, opts?: any): any {
  return (globalThis as any).__fakeSupabase(url, key, opts)
}

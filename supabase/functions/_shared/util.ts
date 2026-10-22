// Utilidades comunes de las Edge Functions de EN-MATCH.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-sonnet-5-5'

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Error con mensaje seguro para mostrar a la persona.
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function servir(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
    try { return await handler(req) }
    catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message })
      console.error(e)
      return json(500, { error: 'Ocurrió un error. Intenta de nuevo.' })
    }
  })
}

export async function leerJson(req: Request): Promise<any> {
  try { return await req.json() } catch { throw new HttpError(400, 'Solicitud inválida.') }
}

export async function autenticar(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const usuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user }, error } = await usuario.auth.getUser()
  if (error || !user) throw new HttpError(401, 'Inicia sesión para continuar.')
  const admin = createClient(url, service)
  const { data: perfil } = await admin.from('perfiles').select('rol,nombre,verificada,consentimiento_cv').eq('id', user.id).maybeSingle()
  if (!perfil) throw new HttpError(403, 'No encontramos tu perfil.')
  return { user, usuario, admin, perfil }
}

// Máximo de usos de una función de IA por persona cada 24 h (controla el costo).
export async function limitar(admin: any, userId: string, funcion: string, max: number) {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await admin.from('ia_log').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('funcion', funcion).gte('creado_en', desde)
  if ((count ?? 0) >= max) throw new HttpError(429, 'Llegaste al límite de ' + max + ' usos por día de esta función. Intenta mañana.')
  await admin.from('ia_log').insert({ user_id: userId, funcion })
}

// Llama a Claude obligando a responder con una herramienta (salida estructurada).
export async function llamarClaude(opts: { system: string; tool: any; texto: string; maxTokens?: number }) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new HttpError(500, 'La IA aún no está configurada en el servidor.')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
      messages: [{ role: 'user', content: opts.texto }]
    })
  })
  if (!r.ok) {
    console.error('Claude API', r.status, await r.text())
    throw new HttpError(502, 'La IA no respondió. Intenta de nuevo en unos minutos.')
  }
  const out = await r.json()
  const uso = out?.content?.find((c: any) => c.type === 'tool_use')
  if (!uso?.input) throw new HttpError(502, 'La IA no pudo procesar el texto. Reescríbelo con más detalle.')
  return uso.input
}

export const esUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

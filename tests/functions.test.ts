// Prueba las Edge Functions de punta a punta con una base de datos en memoria y una IA simulada.
// Ejecutar con Deno:  deno test --allow-env --allow-read --import-map=tests/import_map.json tests/functions.test.ts
// deno-lint-ignore-file no-explicit-any
import assert from 'node:assert/strict'

type Row = Record<string, any>
const db: Record<string, Row[]> = {}
const TABLAS = ['perfiles', 'analisis_cv', 'analisis_log', 'ia_log', 'ofertas', 'postulaciones', 'retos', 'reto_resultados']
const UNIQ: Record<string, string[]> = { reto_resultados: ['oferta_id', 'estudiante_id'], postulaciones: ['oferta_id', 'estudiante_id'], analisis_cv: ['user_id'] }
const DEFAULTS: Record<string, Row> = { ofertas: { tiene_reto: false }, postulaciones: { estado: 'interesado', motivo: null } }
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const USERS: Record<string, string> = {}
const FILES: Record<string, Uint8Array> = {}
const claude: { calls: any[]; next: any; status: number } = { calls: [], next: {}, status: 200 }

function tabla(name: string) {
  const st: any = { f: [], op: 'select', payload: null, count: false, head: false, order: null, limit: null, ret: false, single: null }
  const fin = (out: Row[]) => {
    if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
    if (st.single === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { message: 'sin filas' } }
    return { data: out, error: null }
  }
  const run = () => {
    const rows = db[name]
    const hit = () => rows.filter(r => st.f.every((f: any) => f(r)))
    if (st.op === 'select') {
      let out = hit()
      if (st.order) out = [...out].sort((a, c) => (a[st.order[0]] > c[st.order[0]] ? 1 : -1) * (st.order[1] ? 1 : -1))
      if (st.limit) out = out.slice(0, st.limit)
      return st.head ? { data: null, count: out.length, error: null } : fin(out)
    }
    if (st.op === 'insert' || st.op === 'upsert') {
      const created: Row[] = []
      for (const p of Array.isArray(st.payload) ? st.payload : [st.payload]) {
        const row = { id: uid(), creado_en: new Date().toISOString(), ...DEFAULTS[name], ...p }
        const key = UNIQ[name]
        const dup = key && rows.find(r => key.every(k => r[k] === row[k]))
        if (dup) { if (st.op === 'upsert') { Object.assign(dup, p); created.push(dup); continue } return { data: null, error: { message: 'duplicate key' } } }
        rows.push(row); created.push(row)
      }
      return st.ret ? fin(created) : { data: null, error: null }
    }
    if (st.op === 'update') { const h = hit(); h.forEach(r => Object.assign(r, st.payload)); return st.ret ? fin(h) : { data: null, error: null } }
    if (st.op === 'delete') { db[name] = rows.filter(r => !st.f.every((f: any) => f(r))); return { data: null, error: null } }
  }
  const b: any = {
    select(_c?: string, o?: any) { if (st.op === 'select') { st.count = o?.count === 'exact'; st.head = !!o?.head } else st.ret = true; return b },
    insert(p: any) { st.op = 'insert'; st.payload = p; return b },
    update(p: any) { st.op = 'update'; st.payload = p; return b },
    upsert(p: any) { st.op = 'upsert'; st.payload = p; return b },
    delete() { st.op = 'delete'; return b },
    eq(c: string, v: any) { st.f.push((r: Row) => r[c] === v); return b },
    neq(c: string, v: any) { st.f.push((r: Row) => r[c] !== v); return b },
    in(c: string, vs: any[]) { st.f.push((r: Row) => vs.includes(r[c])); return b },
    gte(c: string, v: any) { st.f.push((r: Row) => r[c] >= v); return b },
    order(c: string, o?: any) { st.order = [c, o?.ascending !== false]; return b },
    limit(n: number) { st.limit = n; return b },
    maybeSingle() { st.single = 'maybe'; return b },
    single() { st.single = 'one'; return b },
    then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej) }
  }
  return b
}

;(globalThis as any).__fakeSupabase = (_url: string, _key: string, opts: any) => ({
  from: tabla,
  auth: { getUser: async () => {
    const t = String(opts?.global?.headers?.Authorization ?? '').replace('Bearer ', '')
    return USERS[t] ? { data: { user: { id: USERS[t] } }, error: null } : { data: { user: null }, error: { message: 'no' } }
  } },
  storage: { from: () => ({ download: async (path: string) => FILES[path] ? { data: new Blob([FILES[path] as any]), error: null } : { data: null, error: { message: 'no existe' } } }) }
})

;(globalThis as any).fetch = async (url: any, init: any) => {
  if (!String(url).includes('api.anthropic.com')) throw new Error('fetch inesperado: ' + url)
  claude.calls.push(JSON.parse(init.body))
  if (claude.status !== 200) return new Response('falla', { status: claude.status })
  return new Response(JSON.stringify({ content: [{ type: 'tool_use', input: claude.next }] }), { status: 200 })
}

// Cada función llama Deno.serve(handler) al cargarse: capturamos el handler.
const handlers: Record<string, (r: Request) => Promise<Response>> = {}
Deno.env.set('SUPABASE_URL', 'http://fake'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service'); Deno.env.set('ANTHROPIC_API_KEY', 'sk-test')
for (const n of ['analizar-cv', 'publicar-oferta', 'match-feed', 'match-candidatos', 'reto-generar', 'reto-obtener', 'reto-responder']) {
  ;(Deno as any).serve = (h: any) => { handlers[n] = h }
  await import(`../supabase/functions/${n}/index.ts`)
}

const U = { est: uid(), est2: uid(), est3: uid(), org: uid(), org2: uid() }
const T = (id: string) => { USERS['t-' + id] = id; return 't-' + id }
async function call(fn: string, token: string | null, body: any, method = 'POST') {
  const r = await handlers[fn](new Request('http://x/' + fn, { method, headers: { Authorization: token ? 'Bearer ' + token : '', 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }))
  return { status: r.status, body: await r.json().catch(() => null) as any }
}
function reset() {
  for (const t of TABLAS) db[t] = []
  claude.calls = []; claude.status = 200; claude.next = {}
  for (const k of Object.keys(FILES)) delete FILES[k]
  db.perfiles.push(
    { id: U.est, rol: 'estudiante', nombre: 'Ana Quispe', consentimiento_cv: true },
    { id: U.est2, rol: 'estudiante', nombre: 'Luis Mamani', consentimiento_cv: true },
    { id: U.est3, rol: 'estudiante', nombre: 'Sin CV', consentimiento_cv: false },
    { id: U.org, rol: 'rrhh', nombre: 'Andina SAC', verificada: false },
    { id: U.org2, rol: 'rrhh', nombre: 'Otra SAC', verificada: true })
}
const ext = (extra: any = {}) => ({
  carrera: 'Ingeniería Industrial', ciclo: '8vo ciclo',
  habilidades: [{ nombre: 'Costos y presupuestos', nivel: 'avanzado' }, { nombre: 'Análisis de datos', nivel: 'intermedio' }],
  herramientas: [{ nombre: 'Excel', nivel: 'avanzado' }, { nombre: 'Power BI', nivel: 'intermedio' }],
  idiomas: [{ idioma: 'Inglés', nivel: 'B1' }], experiencia: [{ tipo: 'proyecto', descripcion: 'Modelo de costos', meses: 4 }], logros: [], ...extra })
const analisis = (id: string, e: any = ext()) => db.analisis_cv.push({ user_id: id, extraccion: e, rubro_objetivo: 'costos_finanzas' })
const oferta = (o: any = {}) => { const row = { id: uid(), org_id: U.org2, org_nombre: 'Otra SAC', tipo: 'practica', titulo: 'Practicante', descripcion: 'x'.repeat(50), estado: 'activa', tiene_reto: false, creado_en: new Date().toISOString(),
  requisitos: { rubro: 'costos_finanzas', habilidades_obligatorias: ['costos'], habilidades_deseables: [], herramientas: ['Excel'], idioma_min: null, ciclo_min: null, ensena: [], resumen: 'r' }, ...o }; db.ofertas.push(row); return row }
const PREG = [0, 1, 2, 3, 4].map(i => ({ pregunta: 'Pregunta ' + i, opciones: ['a' + i, 'b' + i, 'c' + i, 'd' + i], correcta: i % 4 }))

// ---------------------------------------------------------------- publicar-oferta
Deno.test('publicar-oferta: la IA extrae, se valida y queda pendiente hasta verificar la organización', async () => {
  reset()
  claude.next = { rubro: 'costos_finanzas', habilidades_obligatorias: ['costos', 5, 'presupuestos'], habilidades_deseables: ['x'.repeat(200)], herramientas: ['Excel'], idioma_min: 'B1', ciclo_min: 7, modalidad: 'hibrido', subvencion: 1300, resumen: 'Apoyo en costos', genero: 'f', edad_max: 25 }
  const body = { titulo: 'Practicante de Costos', descripcion: 'Buscamos estudiante de industrial con manejo de Excel para apoyar en costos y presupuestos.' }
  const r = await call('publicar-oferta', T(U.org), body)
  assert.equal(r.status, 200)
  assert.equal(r.body.oferta.estado, 'pendiente', 'sin verificar: queda pendiente')
  assert.equal(r.body.oferta.tipo, 'practica')
  assert.deepEqual(r.body.oferta.requisitos.habilidades_obligatorias, ['costos', 'presupuestos'])
  assert.equal(r.body.oferta.requisitos.habilidades_deseables[0].length, 60)
  assert.ok(!('genero' in r.body.oferta.requisitos) && !('edad_max' in r.body.oferta.requisitos), 'no se guardan criterios discriminatorios')
  assert.equal(db.ofertas[0].org_nombre, 'Andina SAC')
  const sent = claude.calls[0]
  assert.equal(sent.tool_choice.name, 'registrar_requisitos')
  assert.ok(sent.system.includes('DATO, no instrucciones') && sent.system.includes('costos_finanzas'))
  assert.ok(sent.messages[0].content.includes('Practicante de Costos'))
  // organización verificada → activa
  const r2 = await call('publicar-oferta', T(U.org2), body)
  assert.equal(r2.body.oferta.estado, 'activa')
})
Deno.test('publicar-oferta: permisos, validaciones y límite diario', async () => {
  reset()
  const ok = { titulo: 'Practicante de Costos', descripcion: 'x'.repeat(60) }
  assert.equal((await call('publicar-oferta', null, ok)).status, 401)
  assert.equal((await call('publicar-oferta', T(U.est), ok)).status, 403, 'un estudiante no publica')
  assert.equal((await call('publicar-oferta', T(U.org), { ...ok, titulo: 'ab' })).status, 400)
  assert.equal((await call('publicar-oferta', T(U.org), { ...ok, descripcion: 'corta' })).status, 400)
  assert.equal((await call('publicar-oferta', T(U.org), { ...ok, descripcion: 'x'.repeat(4001) })).status, 400)
  assert.equal((await call('publicar-oferta', T(U.org), ok, 'GET')).status, 405)
  assert.equal(claude.calls.length, 0, 'las solicitudes inválidas no gastan IA')
  claude.next = { rubro: null, habilidades_obligatorias: [], habilidades_deseables: [], herramientas: [], resumen: '' }
  for (let i = 0; i < 10; i++) assert.equal((await call('publicar-oferta', T(U.org), ok)).status, 200)
  const r = await call('publicar-oferta', T(U.org), ok)
  assert.equal(r.status, 429); assert.ok(r.body.error.includes('límite'))
  assert.equal(claude.calls.length, 10)
  // Cada rol publica su tipo
  reset(); claude.next = { habilidades_obligatorias: ['SAP'], habilidades_deseables: [], herramientas: [], resumen: '' }
  db.perfiles.push({ id: 'c1', rol: 'cursos', nombre: 'Cursos SAC', verificada: true }, { id: 'o1', rol: 'ong', nombre: 'ONG', verificada: true })
  assert.equal((await call('publicar-oferta', T('c1'), ok)).body.oferta.tipo, 'curso')
  assert.deepEqual((await call('publicar-oferta', T('c1'), ok)).body.oferta.requisitos.ensena, ['SAP'], 'un curso sin "ensena" usa sus habilidades')
  assert.equal((await call('publicar-oferta', T('o1'), ok)).body.oferta.tipo, 'voluntariado')
})
Deno.test('publicar-oferta: errores de la IA no rompen ni exponen detalles', async () => {
  reset(); claude.status = 529
  const r = await call('publicar-oferta', T(U.org), { titulo: 'Practicante de Costos', descripcion: 'x'.repeat(60) })
  assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.body).includes('falla'))
  assert.equal(db.ofertas.length, 0)
})

// ---------------------------------------------------------------- match-feed
Deno.test('match-feed: ordena por match, oculta lo ya visto y no filtra datos internos', async () => {
  reset(); analisis(U.est)
  const bueno = oferta({ titulo: 'Bueno' })
  const malo = oferta({ titulo: 'Malo', requisitos: { rubro: 'marketing_ventas', habilidades_obligatorias: ['redes sociales', 'branding'], habilidades_deseables: [], herramientas: ['Canva'], ensena: [] } })
  const visto = oferta({ titulo: 'Visto' }); db.postulaciones.push({ id: uid(), oferta_id: visto.id, estudiante_id: U.est, estado: 'omitido' })
  oferta({ titulo: 'Pendiente', estado: 'pendiente' }); oferta({ titulo: 'Curso', tipo: 'curso' })
  const r = await call('match-feed', T(U.est), { tipo: 'practica' })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.ofertas.map((o: any) => o.titulo), ['Bueno', 'Malo'])
  assert.ok(r.body.ofertas[0].match > r.body.ofertas[1].match)
  assert.ok(r.body.ofertas[0].coincide.includes('costos'))
  assert.ok(!('requisitos' in r.body.ofertas[0]) && !('org_id' in r.body.ofertas[0]), 'no se exponen campos internos')
  assert.equal(r.body.ofertas[0].org_nombre, 'Otra SAC')
  void bueno; void malo
})
Deno.test('match-feed: validaciones y permisos', async () => {
  reset()
  assert.equal((await call('match-feed', T(U.est), { tipo: 'practica' })).status, 409, 'sin CV analizado')
  assert.equal((await call('match-feed', T(U.est), { tipo: 'cualquiera' })).status, 400)
  assert.equal((await call('match-feed', T(U.org), { tipo: 'practica' })).status, 403, 'una org no tiene feed')
  assert.equal((await call('match-feed', null, { tipo: 'practica' })).status, 401)
  analisis(U.est); const c = oferta({ tipo: 'curso', requisitos: { rubro: 'costos_finanzas', ensena: ['SAP', 'Python'], habilidades_obligatorias: [], habilidades_deseables: [], herramientas: [] } })
  const r = await call('match-feed', T(U.est), { tipo: 'curso' })
  assert.equal(r.body.ofertas[0].id, c.id); assert.ok(r.body.ofertas[0].match >= 60, 'un curso de lo que falta tiene match alto')
})

// ---------------------------------------------------------------- match-candidatos
Deno.test('match-candidatos: solo el dueño, sin omitidos, con lista corta y retos', async () => {
  reset()
  const of = oferta({ org_id: U.org, org_nombre: 'Andina SAC' })
  analisis(U.est); analisis(U.est2, ext({ habilidades: [], herramientas: [], experiencia: [], idiomas: [] })); analisis(U.est3)
  db.postulaciones.push(
    { id: 'p1', oferta_id: of.id, estudiante_id: U.est, estado: 'reto_aprobado' },
    { id: 'p2', oferta_id: of.id, estudiante_id: U.est2, estado: 'interesado' },
    { id: 'p3', oferta_id: of.id, estudiante_id: U.est3, estado: 'omitido' })
  let r = await call('match-candidatos', T(U.org), { oferta_id: of.id })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.candidatos.map((c: any) => c.id), ['p1', 'p2'], 'sin omitidos; el mejor primero')
  assert.equal(r.body.reto, null)
  assert.ok(!JSON.stringify(r.body).includes('@') , 'no se comparte el correo')
  assert.ok(r.body.candidatos[0].match > r.body.candidatos[1].match)
  assert.equal(r.body.candidatos[0].nombre, 'Ana Quispe')
  assert.equal((await call('match-candidatos', T(U.org2), { oferta_id: of.id })).status, 403, 'otra org no ve candidatos ajenos')
  assert.equal((await call('match-candidatos', T(U.est), { oferta_id: of.id })).status, 403)
  assert.equal((await call('match-candidatos', T(U.org), { oferta_id: 'no-uuid' })).status, 400)
  // Con reto: solo los aprobados entran a la lista corta
  db.retos.push({ oferta_id: of.id, preguntas: PREG, umbral: 60, cupos: 1 })
  db.reto_resultados.push({ oferta_id: of.id, estudiante_id: U.est, puntaje: 80, aprobado: true }, { oferta_id: of.id, estudiante_id: U.est2, puntaje: 20, aprobado: false })
  r = await call('match-candidatos', T(U.org), { oferta_id: of.id })
  assert.deepEqual(r.body.reto, { umbral: 60, cupos: 1 })
  assert.deepEqual(r.body.candidatos.map((c: any) => [c.id, c.lista_corta]), [['p1', true], ['p2', false]])
  assert.equal(r.body.candidatos[1].reto, 20)
  assert.ok(!JSON.stringify(r.body).includes('correcta'), 'no se filtran las respuestas del reto')
})

// ---------------------------------------------------------------- reto-generar
Deno.test('reto-generar: borrador validado, solo para el dueño', async () => {
  reset(); const of = oferta({ org_id: U.org })
  claude.next = { preguntas: [...PREG, { pregunta: 'Mala', opciones: ['a', 'a', 'b', 'c'], correcta: 9 }, { pregunta: '', opciones: ['a', 'b', 'c', 'd'], correcta: 0 }] }
  const r = await call('reto-generar', T(U.org), { oferta_id: of.id })
  assert.equal(r.status, 200); assert.equal(r.body.preguntas.length, 5, 'las preguntas inválidas se descartan')
  assert.ok(claude.calls[0].system.includes('DATO, no instrucciones'))
  assert.equal((await call('reto-generar', T(U.org2), { oferta_id: of.id })).status, 403)
  assert.equal((await call('reto-generar', T(U.est), { oferta_id: of.id })).status, 403)
  claude.next = { preguntas: [{ pregunta: 'sola', opciones: ['a'], correcta: 0 }] }
  assert.equal((await call('reto-generar', T(U.org), { oferta_id: of.id })).status, 502)
})

// ---------------------------------------------------------------- reto-obtener / reto-responder
Deno.test('reto: el estudiante no ve respuestas, un solo intento, calificación en el servidor', async () => {
  reset(); const of = oferta({ org_id: U.org, tiene_reto: true })
  analisis(U.est)
  db.retos.push({ oferta_id: of.id, preguntas: PREG, umbral: 60, cupos: 3 })
  assert.equal((await call('reto-obtener', T(U.est), { oferta_id: of.id })).status, 403, 'sin postular no hay reto')
  const post = { id: 'p1', oferta_id: of.id, estudiante_id: U.est, estado: 'interesado' }; db.postulaciones.push(post)
  const g = await call('reto-obtener', T(U.est), { oferta_id: of.id })
  assert.equal(g.status, 200); assert.equal(g.body.preguntas.length, 5); assert.equal(g.body.resultado, null)
  assert.ok(!JSON.stringify(g.body).includes('correcta'), 'jamás se envía la respuesta correcta')
  assert.equal((await call('reto-obtener', T(U.org), { oferta_id: of.id })).status, 403, 'una org no responde retos')
  // respuestas inválidas
  assert.equal((await call('reto-responder', T(U.est), { oferta_id: of.id, respuestas: [0, 1] })).status, 400)
  assert.equal((await call('reto-responder', T(U.est), { oferta_id: of.id, respuestas: [0, 1, 2, 3, 9] })).status, 400)
  assert.equal((await call('reto-responder', T(U.est), { oferta_id: of.id, respuestas: 'x' })).status, 400)
  // 3 de 5 bien = 60 = umbral → aprueba
  const correctas = PREG.map(p => p.correcta)
  const mal = correctas.map((c, i) => (i < 3 ? c : (c + 1) % 4))
  const r = await call('reto-responder', T(U.est), { oferta_id: of.id, respuestas: mal })
  assert.deepEqual([r.status, r.body.puntaje, r.body.aprobado, r.body.correctas], [200, 60, true, 3])
  assert.equal(db.postulaciones[0].estado, 'reto_aprobado')
  assert.equal((await call('reto-responder', T(U.est), { oferta_id: of.id, respuestas: correctas })).status, 409, 'un solo intento')
  assert.equal((await call('reto-obtener', T(U.est), { oferta_id: of.id })).body.resultado.puntaje, 60)
  // no aprobado
  db.postulaciones.push({ id: 'p2', oferta_id: of.id, estudiante_id: U.est2, estado: 'interesado' })
  const n = await call('reto-responder', T(U.est2), { oferta_id: of.id, respuestas: correctas.map(c => (c + 1) % 4) })
  assert.deepEqual([n.body.puntaje, n.body.aprobado], [0, false])
  assert.equal(db.postulaciones.find(p => p.id === 'p2')!.estado, 'reto_no_aprobado')
  // si la organización ya respondió, no se puede responder
  db.postulaciones.push({ id: 'p3', oferta_id: of.id, estudiante_id: U.est3, estado: 'descartado' })
  assert.equal((await call('reto-responder', T(U.est3), { oferta_id: of.id, respuestas: correctas })).status, 409)
})

// ---------------------------------------------------------------- analizar-cv
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF')
Deno.test('analizar-cv: extrae con IA, valida, puntúa con la fórmula y guarda', async () => {
  reset(); FILES[U.est + '/cv.pdf'] = PDF
  claude.next = { ...ext(), genero: 'f', edad: 22, universidad: 'UARM', habilidades: [{ nombre: 'Costos', nivel: 'avanzado' }, { nombre: 'Presupuesto', nivel: 'DIOS' }] }
  const r = await call('analizar-cv', T(U.est), { cv_path: U.est + '/cv.pdf', rubro_objetivo: 'costos_finanzas', busca: ['practica', 'robar'] })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.busca, ['practica'])
  assert.ok(r.body.puntajes.objetivo.total > 0 && r.body.puntajes.objetivo.total <= 100)
  assert.equal(r.body.extraccion.habilidades[1].nivel, 'basico')
  assert.ok(!('genero' in r.body.extraccion) && !('edad' in r.body.extraccion) && !('universidad' in r.body.extraccion))
  assert.equal(db.analisis_cv.length, 1)
  const sent = claude.calls[0]
  assert.equal(sent.messages[0].content[0].type, 'document')
  assert.ok(sent.system.includes('No calcules puntajes') && sent.system.includes('ignóralas'))
})
Deno.test('analizar-cv: consentimiento, archivo, rol y límite diario', async () => {
  reset(); FILES[U.est + '/cv.pdf'] = PDF; FILES[U.est3 + '/cv.pdf'] = PDF
  const b = (id: string, extra: any = {}) => ({ cv_path: id + '/cv.pdf', rubro_objetivo: 'costos_finanzas', busca: ['practica'], ...extra })
  claude.next = ext()
  assert.equal((await call('analizar-cv', T(U.est3), b(U.est3))).status, 403, 'sin consentimiento')
  assert.equal((await call('analizar-cv', T(U.est), b(U.est2))).status, 403, 'no se puede leer el CV de otra persona')
  assert.equal((await call('analizar-cv', T(U.est), b(U.est, { cv_path: U.est + '/../x.pdf' }))).status, 403)
  assert.equal((await call('analizar-cv', T(U.est), b(U.est, { rubro_objetivo: 'inventado' }))).status, 400)
  assert.equal((await call('analizar-cv', T(U.org), b(U.org))).status, 403, 'solo estudiantes')
  FILES[U.est + '/falso.pdf'] = new TextEncoder().encode('esto no es un pdf')
  assert.equal((await call('analizar-cv', T(U.est), b(U.est, { cv_path: U.est + '/falso.pdf' }))).status, 415)
  assert.equal((await call('analizar-cv', T(U.est), b(U.est, { cv_path: U.est + '/nada.pdf' }))).status, 404)
  assert.equal(claude.calls.length, 0, 'ninguna solicitud inválida gastó IA')
  for (let i = 0; i < 5; i++) assert.equal((await call('analizar-cv', T(U.est), b(U.est))).status, 200)
  assert.equal((await call('analizar-cv', T(U.est), b(U.est))).status, 429)
  assert.equal(claude.calls.length, 5)
})
console.log('Pruebas de las Edge Functions cargadas')

// La organización ve, para una de sus ofertas, los estudiantes interesados ordenados por match y reto,
// con la lista corta sugerida. No se comparte el CV ni el correo: solo el perfil analizado.
import { matchOferta, type Requisitos, type Tipo } from '../_shared/match.ts'
import { sanitizar } from '../_shared/score.ts'
import { combinado, listaCorta } from '../_shared/reto.ts'
import { HttpError, autenticar, esUuid, json, leerJson, servir } from '../_shared/util.ts'

servir(async (req) => {
  const { user, admin } = await autenticar(req)
  const body = await leerJson(req)
  if (!esUuid(body?.oferta_id)) throw new HttpError(400, 'Oferta inválida.')

  const { data: oferta } = await admin.from('ofertas').select('id,org_id,tipo,titulo,requisitos').eq('id', body.oferta_id).maybeSingle()
  if (!oferta || oferta.org_id !== user.id) throw new HttpError(403, 'Esta oferta no es tuya.')

  const { data: posts } = await admin.from('postulaciones').select('id,estudiante_id,estado,motivo,creado_en')
    .eq('oferta_id', oferta.id).neq('estado', 'omitido')
  const ids = (posts ?? []).map((p: any) => p.estudiante_id)

  const [{ data: analisis }, { data: perfiles }, { data: reto }, { data: resultados }] = await Promise.all([
    ids.length ? admin.from('analisis_cv').select('user_id,extraccion,rubro_objetivo').in('user_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('perfiles').select('id,nombre').in('id', ids) : Promise.resolve({ data: [] }),
    admin.from('retos').select('umbral,cupos').eq('oferta_id', oferta.id).maybeSingle(),
    admin.from('reto_resultados').select('estudiante_id,puntaje,aprobado').eq('oferta_id', oferta.id)
  ])
  const aMap = new Map((analisis ?? []).map((a: any) => [a.user_id, a]))
  const nMap = new Map((perfiles ?? []).map((p: any) => [p.id, p.nombre]))
  const rMap = new Map((resultados ?? []).map((r: any) => [r.estudiante_id, r]))

  const cands: any[] = (posts ?? []).flatMap((p: any) => {
    const a: any = aMap.get(p.estudiante_id)
    if (!a) return []
    const ext = sanitizar(a.extraccion)
    const m = matchOferta(ext, a.rubro_objetivo, oferta.requisitos as Requisitos, oferta.tipo as Tipo)
    const r: any = rMap.get(p.estudiante_id)
    return [{
      id: p.id, estado: p.estado, motivo: p.motivo, desde: p.creado_en,
      nombre: nMap.get(p.estudiante_id) ?? 'Estudiante',
      carrera: ext.carrera, ciclo: ext.ciclo,
      match: m.score, coincide: m.coincide, falta: m.falta, notas: m.notas,
      reto: r ? r.puntaje : null, aprobado: r ? r.aprobado : null
    }]
  })

  const hayReto = !!reto
  const corta = listaCorta(cands, hayReto, reto?.cupos ?? 5)
  const salida = cands
    .map((c: any) => ({ ...c, combinado: combinado(c.match, c.reto), lista_corta: corta.has(c.id) }))
    .sort((a: any, b: any) => Number(b.lista_corta) - Number(a.lista_corta) || b.combinado - a.combinado)

  return json(200, {
    oferta: { id: oferta.id, titulo: oferta.titulo, tipo: oferta.tipo },
    reto: hayReto ? { umbral: reto!.umbral, cupos: reto!.cupos } : null,
    candidatos: salida
  })
})

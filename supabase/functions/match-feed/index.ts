// Devuelve al estudiante las ofertas activas ordenadas por match (las que aún no vio).
import { matchOferta, type Requisitos, type Tipo } from '../_shared/match.ts'
import { sanitizar } from '../_shared/score.ts'
import { HttpError, autenticar, json, leerJson, servir } from '../_shared/util.ts'

servir(async (req) => {
  const { user, admin, perfil } = await autenticar(req)
  if (perfil.rol !== 'estudiante') throw new HttpError(403, 'Solo las cuentas de estudiante tienen este feed.')
  const body = await leerJson(req)
  const tipo = String(body?.tipo ?? '') as Tipo
  if (!['practica', 'curso', 'voluntariado'].includes(tipo)) throw new HttpError(400, 'Tipo inválido.')

  const { data: a } = await admin.from('analisis_cv').select('extraccion,rubro_objetivo').eq('user_id', user.id).maybeSingle()
  if (!a) throw new HttpError(409, 'Primero sube tu CV en “Mi CV y puntaje” para calcular tu match.')
  const ext = sanitizar(a.extraccion)

  const { data: vistas } = await admin.from('postulaciones').select('oferta_id').eq('estudiante_id', user.id)
  const yaVistas = new Set((vistas ?? []).map((v: any) => v.oferta_id))
  const { data: ofertas, error } = await admin.from('ofertas')
    .select('id,tipo,titulo,descripcion,org_nombre,requisitos,tiene_reto,creado_en')
    .eq('estado', 'activa').eq('tipo', tipo).order('creado_en', { ascending: false }).limit(200)
  if (error) throw new HttpError(500, 'No pudimos cargar las ofertas.')

  const lista = (ofertas ?? []).filter((o: any) => !yaVistas.has(o.id)).map((o: any) => {
    const req = o.requisitos as Requisitos
    const m = matchOferta(ext, a.rubro_objetivo, req, tipo)
    return {
      id: o.id, tipo: o.tipo, titulo: o.titulo, org_nombre: o.org_nombre, tiene_reto: o.tiene_reto,
      descripcion: String(o.descripcion).slice(0, 700),
      detalle: { resumen: req.resumen, modalidad: req.modalidad, ubicacion: req.ubicacion, subvencion: req.subvencion, horas: req.horas, idioma_min: req.idioma_min, ciclo_min: req.ciclo_min },
      match: m.score, coincide: m.coincide, falta: m.falta, notas: m.notas
    }
  }).sort((x: any, y: any) => y.match - x.match).slice(0, 30)

  return json(200, { ofertas: lista })
})

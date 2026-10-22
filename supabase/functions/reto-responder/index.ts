// Califica el reto en el servidor. Un solo intento por estudiante.
import { calificar, sanitizarPreguntas } from '../_shared/reto.ts'
import { HttpError, autenticar, esUuid, json, leerJson, servir } from '../_shared/util.ts'

servir(async (req) => {
  const { user, admin, perfil } = await autenticar(req)
  if (perfil.rol !== 'estudiante') throw new HttpError(403, 'Solo estudiantes.')
  const body = await leerJson(req)
  if (!esUuid(body?.oferta_id)) throw new HttpError(400, 'Oferta inválida.')

  const { data: post } = await admin.from('postulaciones').select('id,estado').eq('oferta_id', body.oferta_id).eq('estudiante_id', user.id).maybeSingle()
  if (!post || post.estado === 'omitido') throw new HttpError(403, 'Primero muestra interés en esta oferta.')
  if (['entrevista', 'descartado'].includes(post.estado)) throw new HttpError(409, 'La organización ya respondió tu postulación.')
  const { data: reto } = await admin.from('retos').select('preguntas,umbral').eq('oferta_id', body.oferta_id).maybeSingle()
  if (!reto) throw new HttpError(404, 'Esta oferta no tiene reto.')
  const preguntas = sanitizarPreguntas(reto.preguntas)
  if (!preguntas.length) throw new HttpError(500, 'El reto no está bien configurado.')

  const resp = body?.respuestas
  if (!Array.isArray(resp) || resp.length !== preguntas.length || resp.some((x: unknown) => !Number.isInteger(x) || (x as number) < 0 || (x as number) > 3))
    throw new HttpError(400, 'Responde todas las preguntas.')

  const res = calificar(preguntas, resp, reto.umbral)
  // La clave primaria (oferta, estudiante) garantiza un solo intento aunque lleguen dos solicitudes a la vez.
  const { error } = await admin.from('reto_resultados').insert({ oferta_id: body.oferta_id, estudiante_id: user.id, puntaje: res.puntaje, aprobado: res.aprobado })
  if (error) throw new HttpError(409, 'Ya respondiste este reto.')
  if (post.estado === 'interesado') {
    await admin.from('postulaciones').update({ estado: res.aprobado ? 'reto_aprobado' : 'reto_no_aprobado' }).eq('id', post.id)
  }
  return json(200, { puntaje: res.puntaje, aprobado: res.aprobado, umbral: reto.umbral, correctas: res.correctas, total: res.total })
})

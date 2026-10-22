// El estudiante recibe las preguntas del reto SIN las respuestas correctas.
import { paraEstudiante, sanitizarPreguntas } from '../_shared/reto.ts'
import { HttpError, autenticar, esUuid, json, leerJson, servir } from '../_shared/util.ts'

servir(async (req) => {
  const { user, admin, perfil } = await autenticar(req)
  if (perfil.rol !== 'estudiante') throw new HttpError(403, 'Solo estudiantes.')
  const body = await leerJson(req)
  if (!esUuid(body?.oferta_id)) throw new HttpError(400, 'Oferta inválida.')

  const { data: post } = await admin.from('postulaciones').select('estado').eq('oferta_id', body.oferta_id).eq('estudiante_id', user.id).maybeSingle()
  if (!post || post.estado === 'omitido') throw new HttpError(403, 'Primero muestra interés en esta oferta.')
  const { data: reto } = await admin.from('retos').select('preguntas,umbral').eq('oferta_id', body.oferta_id).maybeSingle()
  if (!reto) throw new HttpError(404, 'Esta oferta no tiene reto.')
  const { data: previo } = await admin.from('reto_resultados').select('puntaje,aprobado').eq('oferta_id', body.oferta_id).eq('estudiante_id', user.id).maybeSingle()

  return json(200, {
    preguntas: paraEstudiante(sanitizarPreguntas(reto.preguntas)),
    umbral: reto.umbral,
    resultado: previo ? { puntaje: previo.puntaje, aprobado: previo.aprobado } : null
  })
})

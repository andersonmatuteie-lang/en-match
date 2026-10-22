// Retos de selección: preguntas de opción múltiple que la empresa define (o edita desde un borrador de la IA).
// Se califican en el servidor, nunca en el navegador: el estudiante jamás recibe la respuesta correcta.
export type Pregunta = { pregunta: string; opciones: string[]; correcta: number }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Devuelve solo las preguntas válidas (texto + exactamente 4 opciones + una correcta). Máximo 8.
export function sanitizarPreguntas(raw: unknown): Pregunta[] {
  const out: Pregunta[] = []
  for (const p of (Array.isArray(raw) ? raw : []).slice(0, 12) as any[]) {
    const pregunta = str(p?.pregunta, 300)
    const opciones = (Array.isArray(p?.opciones) ? p.opciones : []).slice(0, 4).map((o: unknown) => str(o, 160))
    const correcta = p?.correcta
    if (!pregunta || opciones.length !== 4 || opciones.some((o: string) => !o)) continue
    if (!Number.isInteger(correcta) || correcta < 0 || correcta > 3) continue
    if (new Set(opciones.map((o: string) => o.toLowerCase())).size !== 4) continue
    out.push({ pregunta, opciones, correcta })
    if (out.length === 8) break
  }
  return out
}

// Lo que ve el estudiante: sin la respuesta correcta.
export const paraEstudiante = (ps: Pregunta[]) => ps.map(p => ({ pregunta: p.pregunta, opciones: p.opciones }))

export function calificar(ps: Pregunta[], respuestas: unknown, umbral: number) {
  const r = Array.isArray(respuestas) ? respuestas : []
  let bien = 0
  ps.forEach((p, i) => { if (r[i] === p.correcta) bien++ })
  const puntaje = ps.length ? Math.round((100 * bien) / ps.length) : 0
  return { puntaje, aprobado: puntaje >= umbral, correctas: bien, total: ps.length }
}

// Combina match y reto: si hay reto, pesan igual; si no, solo el match.
export const combinado = (match: number, reto: number | null) => (reto === null ? match : Math.round((match + reto) / 2))

// Lista corta: con reto, los aprobados mejor combinados hasta llenar los cupos; sin reto, los mejores por match.
export function listaCorta<T extends { id: string; match: number; reto: number | null; aprobado: boolean | null; estado: string }>(
  cands: T[], hayReto: boolean, cupos: number
): Set<string> {
  const vivos = cands.filter(c => c.estado !== 'descartado')
  const elegibles = hayReto ? vivos.filter(c => c.aprobado === true) : vivos
  return new Set(
    elegibles.sort((a, b) => (hayReto ? combinado(b.match, b.reto) - combinado(a.match, a.reto) : b.match - a.match)).slice(0, cupos).map(c => c.id)
  )
}

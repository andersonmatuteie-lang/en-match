// Motor de match de EN-MATCH (estudiante <-> práctica / curso / voluntariado).
// La IA solo EXTRAE los requisitos del texto de la oferta (publicar-oferta). El porcentaje lo calcula esta fórmula.
import { RUBROS, NIVEL_PESO, coincide, norm, puntuar, puntuarTodos, type Extraccion } from './score.ts'

export type Tipo = 'practica' | 'curso' | 'voluntariado'
export type Requisitos = {
  rubro: string | null
  habilidades_obligatorias: string[]
  habilidades_deseables: string[]
  herramientas: string[]
  idioma_min: string | null
  ciclo_min: number | null
  ensena: string[]
  modalidad: string | null
  ubicacion: string | null
  subvencion: number | null
  horas: number | null
  resumen: string
}
export type Match = { score: number; coincide: string[]; falta: string[]; notas: string[] }

const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const lista = (a: unknown, n = 12, max = 60) =>
  [...new Set((Array.isArray(a) ? a : []).slice(0, n * 2).map(x => str(x, max)).filter(Boolean))].slice(0, n)
const num = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null

const RANGO: Record<string, number> = { a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6, nativo: 6 }

// Valida lo que devuelve la IA. Nunca confiar en la salida tal cual.
export function sanitizarRequisitos(raw: any, tipo: Tipo): Requisitos {
  const oblig = lista(raw?.habilidades_obligatorias)
  const des = lista(raw?.habilidades_deseables)
  let ensena = lista(raw?.ensena)
  if (tipo === 'curso' && !ensena.length) ensena = [...oblig, ...des].slice(0, 12)
  const idioma = norm(str(raw?.idioma_min, 10))
  const modal = norm(str(raw?.modalidad, 20))
  return {
    rubro: typeof raw?.rubro === 'string' && RUBROS[raw.rubro] ? raw.rubro : null,
    habilidades_obligatorias: oblig,
    habilidades_deseables: des,
    herramientas: lista(raw?.herramientas),
    idioma_min: RANGO[idioma] ? idioma : null,
    ciclo_min: num(raw?.ciclo_min, 1, 12),
    ensena,
    modalidad: ['presencial', 'hibrido', 'remoto'].includes(modal) ? modal : null,
    ubicacion: str(raw?.ubicacion, 80) || null,
    subvencion: num(raw?.subvencion, 0, 20000),
    horas: num(raw?.horas, 1, 2000),
    resumen: str(raw?.resumen, 220)
  }
}

function nivelIngles(ext: Extraccion) {
  const i = ext.idiomas.find(x => norm(x.idioma).startsWith('ingles') || norm(x.idioma) === 'english')
  if (!i) return 0
  const n = norm(i.nivel)
  return RANGO[n] ?? 2 // "desconocido": asumimos A2
}

function cicloNum(ciclo: string | null) {
  const c = norm(ciclo ?? '')
  if (!c) return null
  if (c.includes('egres') || c.includes('titul') || c.includes('bachiller')) return 12
  const m = c.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

export function matchOferta(ext: Extraccion, rubroObjetivo: string, req: Requisitos, tipo: Tipo): Match {
  const conocidas = [...ext.habilidades, ...ext.herramientas]
  const evidencia = (t: string) => norm(t).length >= 3 && ext.experiencia.some(e => norm(e.descripcion).includes(norm(t)))
  const cubre = (t: string) => {
    const hits = conocidas.filter(i => coincide(i.nombre, t))
    if (hits.length) return Math.max(...hits.map(h => NIVEL_PESO[h.nivel] ?? 0.6))
    return evidencia(t) ? 0.5 : 0
  }
  const cob = (items: string[], vacio: number) => {
    if (!items.length) return { ratio: vacio, ok: [] as string[], falta: [] as string[] }
    const ok: string[] = [], falta: string[] = []
    let suma = 0
    for (const t of items) { const c = cubre(t); suma += c; (c >= 0.5 ? ok : falta).push(t) }
    return { ratio: suma / items.length, ok, falta }
  }
  const top3 = puntuarTodos(ext).slice(0, 3).map(r => r.rubro)
  const rubroR = !req.rubro ? 0.6 : req.rubro === rubroObjetivo ? 1 : top3.includes(req.rubro) ? 0.6 : 0

  if (tipo === 'curso') {
    const gaps = [...puntuar(ext, rubroObjetivo).faltan]
    if (nivelIngles(ext) < 3) gaps.push('ingles')
    const ensena = req.ensena
    const cubiertas = ensena.filter(e => gaps.some(g => coincide(e, g)))
    const yaSabe = ensena.length > 0 && ensena.every(e => cubre(e) >= 0.85)
    let ratio = Math.min(1, cubiertas.length / Math.min(3, Math.max(1, ensena.length)))
    if (yaSabe) ratio *= 0.3
    const bonus = req.rubro === rubroObjetivo ? 15 : req.rubro && top3.includes(req.rubro) ? 8 : 0
    const notas: string[] = []
    if (yaSabe) notas.push('Ya dominas lo que enseña este curso')
    return { score: Math.min(100, Math.round(85 * ratio + bonus)), coincide: cubiertas, falta: [], notas }
  }

  const ob = cob(req.habilidades_obligatorias, 0.7)
  const de = cob(req.habilidades_deseables, 0.5)
  const he = cob(req.herramientas, 0.7)
  const niv = nivelIngles(ext)
  const idiomaR = !req.idioma_min ? 1 : Math.min(1, niv / RANGO[req.idioma_min])
  const cn = cicloNum(ext.ciclo)
  const cicloR = !req.ciclo_min ? 1 : cn === null ? 0.5 : cn >= req.ciclo_min ? 1 : cn === req.ciclo_min - 1 ? 0.6 : 0.2

  const score = Math.round(45 * ob.ratio + 15 * de.ratio + 15 * he.ratio + 10 * idiomaR + 10 * cicloR + 5 * rubroR)
  const notas: string[] = []
  if (req.idioma_min && idiomaR < 1) notas.push('Piden inglés ' + req.idioma_min.toUpperCase() + (niv ? '; tu nivel es menor' : '; no declaras nivel'))
  if (req.ciclo_min && cicloR < 1) notas.push('Piden ciclo ' + req.ciclo_min + ' o superior')
  return {
    score: Math.min(100, Math.max(0, score)),
    coincide: [...ob.ok, ...de.ok, ...he.ok],
    falta: [...ob.falta, ...he.falta],
    notas
  }
}

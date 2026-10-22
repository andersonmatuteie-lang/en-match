// Motor de puntaje de EN-MATCH.
// La IA solo EXTRAE datos del CV (ver index.ts). El puntaje lo calcula esta fórmula,
// para que sea explicable y auditable. No usa género, edad, región ni universidad.

export type Nivel = 'basico' | 'intermedio' | 'avanzado'
export type Item = { nombre: string; nivel: Nivel }
export type Idioma = { idioma: string; nivel: string }
export type Experiencia = { tipo: string; descripcion: string; meses: number | null }
export type Extraccion = {
  carrera: string | null
  ciclo: string | null
  habilidades: Item[]
  herramientas: Item[]
  idiomas: Idioma[]
  experiencia: Experiencia[]
  logros: string[]
}

export type Rubro = { nombre: string; claves: string[]; herramientas: string[] }

export const RUBROS: Record<string, Rubro> = {
  costos_finanzas: {
    nombre: 'Costos y finanzas',
    claves: ['costos', 'presupuesto', 'finanzas', 'contabilidad', 'analisis financiero', 'evaluacion de proyectos', 'simulacion', 'analisis de datos'],
    herramientas: ['excel', 'power bi', '@risk', 'sap', 'python', 'sql']
  },
  logistica_operaciones: {
    nombre: 'Logística y operaciones',
    claves: ['logistica', 'almacen', 'inventario', 'cadena de suministro', 'transporte', 'distribucion', 'mejora continua', 'procesos'],
    herramientas: ['excel', 'sap', 'power bi', 'flexsim', 'wms']
  },
  produccion_calidad: {
    nombre: 'Producción y calidad',
    claves: ['produccion', 'calidad', 'lean', 'seis sigma', 'planeamiento', 'mantenimiento', 'seguridad industrial', 'mejora continua'],
    herramientas: ['excel', 'autocad', 'minitab', 'flexsim', 'power bi']
  },
  marketing_ventas: {
    nombre: 'Marketing y ventas',
    claves: ['marketing', 'ventas', 'redes sociales', 'contenido', 'investigacion de mercado', 'branding', 'comunicacion', 'atencion al cliente'],
    herramientas: ['canva', 'google analytics', 'meta ads', 'excel', 'crm', 'power bi']
  },
  tecnologia_datos: {
    nombre: 'Tecnología y datos',
    claves: ['programacion', 'desarrollo', 'datos', 'analisis de datos', 'bases de datos', 'machine learning', 'automatizacion', 'web'],
    herramientas: ['python', 'sql', 'javascript', 'power bi', 'git', 'excel']
  },
  talento_humano: {
    nombre: 'Talento humano',
    claves: ['seleccion de personal', 'reclutamiento', 'capacitacion', 'clima laboral', 'gestion del talento', 'comunicacion', 'liderazgo', 'planillas'],
    herramientas: ['excel', 'power bi', 'ats', 'sap']
  },
  administracion: {
    nombre: 'Administración y gestión',
    claves: ['administracion', 'gestion de proyectos', 'organizacion', 'planificacion', 'atencion al cliente', 'redaccion', 'documentacion', 'liderazgo'],
    herramientas: ['excel', 'word', 'powerpoint', 'ms project', 'power bi']
  }
}

export const PESOS = { habilidades: 35, herramientas: 20, experiencia: 25, idiomas: 10, formacion: 10 } as const
export type Desglose = Record<keyof typeof PESOS, number>

export type Resultado = {
  rubro: string
  nombre: string
  total: number
  desglose: Desglose
  pros: string[]
  contras: string[]
}

const NIVEL_PESO: Record<Nivel, number> = { basico: 0.6, intermedio: 0.85, avanzado: 1 }
const TIPO_PESO: Record<string, number> = { practica: 1, empleo: 1, proyecto: 0.7, liderazgo: 0.6, voluntariado: 0.5 }
const INGLES_PESO: Record<string, number> = { a1: 0.1, a2: 0.3, b1: 0.6, b2: 0.85, c1: 1, c2: 1, nativo: 1, desconocido: 0.3 }

export const norm = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n))

// Coincidencia por palabra completa o frase para evitar que "r" o "go" coincidan por azar.
const coincide = (a: string, b: string) => {
  const x = norm(a), y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  const re = (t: string) => new RegExp('(^|[^a-z0-9@+#])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9@+#]|$)')
  return x.length >= 3 && y.length >= 3 && (re(y).test(x) || re(x).test(y))
}

function cobertura(items: Item[], objetivo: string[]) {
  const hallados: string[] = []
  const faltan: string[] = []
  let suma = 0
  for (const o of objetivo) {
    const hits = items.filter(i => coincide(i.nombre, o))
    if (hits.length) {
      hallados.push(o)
      suma += Math.max(...hits.map(h => NIVEL_PESO[h.nivel] ?? 0.6))
    } else faltan.push(o)
  }
  const meta = Math.max(1, Math.ceil(objetivo.length * 0.6))
  return { ratio: clamp(suma / meta), hallados, faltan }
}

function ratioExperiencia(exp: Experiencia[], rubro: Rubro) {
  const terminos = [...rubro.claves, ...rubro.herramientas]
  let suma = 0
  for (const e of exp.slice(0, 12)) {
    const base = TIPO_PESO[norm(e.tipo)] ?? 0.5
    const texto = norm(e.descripcion)
    const relevante = terminos.some(t => texto.includes(norm(t)))
    const meses = e.meses && e.meses > 0 ? e.meses : 3
    suma += base * (relevante ? 1 : 0.6) * (0.5 + 0.5 * clamp(meses / 6))
  }
  return clamp(suma / 1.5)
}

function ratioIdiomas(idiomas: Idioma[]) {
  const ing = idiomas.find(i => norm(i.idioma).startsWith('ingles') || norm(i.idioma) === 'english')
  if (!ing) return { ratio: 0, nivel: null as string | null }
  const n = norm(ing.nivel)
  return { ratio: INGLES_PESO[n] ?? 0.3, nivel: n }
}

function ratioFormacion(ciclo: string | null) {
  const c = norm(ciclo ?? '')
  if (!c) return 0.3
  if (c.includes('egres') || c.includes('titul') || c.includes('bachiller')) return 1
  const m = c.match(/\d+/)
  const n = m ? parseInt(m[0], 10) : 0
  if (n >= 9) return 1
  if (n >= 7) return 0.85
  if (n >= 5) return 0.6
  if (n >= 3) return 0.35
  return 0.2
}

export function puntuar(ext: Extraccion, rubroKey: string): Resultado {
  const rubro = RUBROS[rubroKey]
  if (!rubro) throw new Error('Rubro desconocido: ' + rubroKey)

  const hab = cobertura(ext.habilidades, rubro.claves)
  const her = cobertura(ext.herramientas, rubro.herramientas)
  const exp = ratioExperiencia(ext.experiencia, rubro)
  const ing = ratioIdiomas(ext.idiomas)
  const frm = ratioFormacion(ext.ciclo)

  const desglose: Desglose = {
    habilidades: Math.round(PESOS.habilidades * hab.ratio),
    herramientas: Math.round(PESOS.herramientas * her.ratio),
    experiencia: Math.round(PESOS.experiencia * exp),
    idiomas: Math.round(PESOS.idiomas * ing.ratio),
    formacion: Math.round(PESOS.formacion * frm)
  }
  const total = Math.min(100, Object.values(desglose).reduce((a, b) => a + b, 0))

  const pros: string[] = []
  const contras: string[] = []
  if (hab.hallados.length) pros.push('Habilidades alineadas: ' + hab.hallados.slice(0, 3).join(', '))
  if (her.hallados.length) pros.push('Herramientas que piden en este rubro: ' + her.hallados.slice(0, 3).join(', '))
  if (exp >= 0.5) pros.push('Experiencia, proyectos o voluntariado relevantes')
  if (ing.ratio >= 0.85) pros.push('Inglés intermedio-alto o superior')
  if (hab.ratio < 0.5 && hab.faltan.length) contras.push('Te faltan habilidades del rubro: ' + hab.faltan.slice(0, 3).join(', '))
  if (her.faltan.length) contras.push('Herramientas por aprender: ' + her.faltan.slice(0, 3).join(', '))
  if (exp < 0.34) contras.push('Aún poca experiencia demostrable: suma un proyecto, voluntariado o práctica')
  if (ing.ratio < 0.6) contras.push(ing.nivel ? 'Tu inglés (' + ing.nivel.toUpperCase() + ') está por debajo de B1' : 'No declaras nivel de inglés')

  return { rubro: rubroKey, nombre: rubro.nombre, total, desglose, pros, contras }
}

export function puntuarTodos(ext: Extraccion) {
  return Object.keys(RUBROS).map(k => puntuar(ext, k)).sort((a, b) => b.total - a.total)
}

const NIVELES = new Set<Nivel>(['basico', 'intermedio', 'avanzado'])
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Valida lo que devuelve la IA: tipos, longitudes y límites. Nunca confiar en la salida tal cual.
export function sanitizar(raw: any): Extraccion {
  const items = (a: unknown): Item[] =>
    (Array.isArray(a) ? a : []).slice(0, 40)
      .map((x: any) => ({ nombre: str(x?.nombre, 60), nivel: (NIVELES.has(x?.nivel) ? x.nivel : 'basico') as Nivel }))
      .filter(x => x.nombre)
  return {
    carrera: str(raw?.carrera, 80) || null,
    ciclo: str(raw?.ciclo, 40) || null,
    habilidades: items(raw?.habilidades),
    herramientas: items(raw?.herramientas),
    idiomas: (Array.isArray(raw?.idiomas) ? raw.idiomas : []).slice(0, 6)
      .map((x: any) => ({ idioma: str(x?.idioma, 30), nivel: norm(str(x?.nivel, 20)) || 'desconocido' }))
      .filter((x: Idioma) => x.idioma),
    experiencia: (Array.isArray(raw?.experiencia) ? raw.experiencia : []).slice(0, 12)
      .map((x: any) => ({
        tipo: norm(str(x?.tipo, 20)) || 'proyecto',
        descripcion: str(x?.descripcion, 200),
        meses: Number.isFinite(x?.meses) && x.meses > 0 && x.meses < 600 ? Math.round(x.meses) : null
      }))
      .filter((x: Experiencia) => x.descripcion),
    logros: (Array.isArray(raw?.logros) ? raw.logros : []).slice(0, 8).map((x: unknown) => str(x, 160)).filter(Boolean)
  }
}

import { puntuar, puntuarTodos, sanitizar, RUBROS } from '../supabase/functions/analizar-cv/score.ts'
import assert from 'node:assert/strict'

const fuerte = sanitizar({
  carrera: 'Ingeniería Industrial', ciclo: '8vo ciclo',
  habilidades: [{ nombre: 'Costos y presupuestos', nivel: 'avanzado' }, { nombre: 'Evaluación de proyectos', nivel: 'intermedio' }, { nombre: 'Simulación', nivel: 'intermedio' }, { nombre: 'Análisis de datos', nivel: 'avanzado' }],
  herramientas: [{ nombre: 'Excel', nivel: 'avanzado' }, { nombre: '@RISK', nivel: 'intermedio' }, { nombre: 'Power BI', nivel: 'intermedio' }],
  idiomas: [{ idioma: 'Inglés', nivel: 'B2' }],
  experiencia: [{ tipo: 'proyecto', descripcion: 'Modelo de costos y simulación Monte Carlo en @RISK', meses: 4 }, { tipo: 'voluntariado', descripcion: 'Diagnóstico de almacén', meses: 3 }]
})
const vacio = sanitizar({})

const a = puntuar(fuerte, 'costos_finanzas')
const b = puntuar(vacio, 'costos_finanzas')
console.log('fuerte', a.total, a.desglose, '\nvacío', b.total)
assert.ok(a.total >= 70 && a.total <= 100, 'perfil fuerte debe puntuar alto')
assert.ok(b.total <= 15, 'perfil vacío debe puntuar bajo')
assert.ok(a.total > b.total)

// rubro correcto queda primero
assert.equal(puntuarTodos(fuerte)[0].rubro, 'costos_finanzas')

// no inventa coincidencias por subcadena ("r" no es "programacion")
assert.equal(puntuar(sanitizar({ habilidades: [{ nombre: 'R', nivel: 'avanzado' }] }), 'tecnologia_datos').desglose.habilidades, 0)

// inglés bajo genera aviso
assert.ok(puntuar(sanitizar({ idiomas: [{ idioma: 'Inglés', nivel: 'A2' }] }), 'costos_finanzas').contras.some(c => c.includes('inglés')))

// sanitizar: basura de la IA no rompe nada ni se cuela
const sucio = sanitizar({ carrera: 'x'.repeat(500), habilidades: [{ nombre: 'Excel', nivel: 'DIOS' }, null, 5], experiencia: [{ tipo: 'empleo', descripcion: 'ok', meses: -4 }], genero: 'f', edad: 20 })
assert.equal(sucio.carrera.length, 80)
assert.equal(sucio.habilidades[0].nivel, 'basico')
assert.equal(sucio.experiencia[0].meses, null)
assert.ok(!('genero' in sucio) && !('edad' in sucio), 'no se conservan datos sensibles')

// el total nunca pasa de 100 ni baja de 0
for (const k of Object.keys(RUBROS)) { const t = puntuar(fuerte, k).total; assert.ok(t >= 0 && t <= 100) }
console.log('OK: todas las pruebas del puntaje pasaron')

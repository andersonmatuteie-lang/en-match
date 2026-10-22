import { matchOferta, sanitizarRequisitos } from '../supabase/functions/_shared/match.ts'
import { sanitizar } from '../supabase/functions/_shared/score.ts'
import { sanitizarPreguntas, calificar, paraEstudiante, listaCorta, combinado } from '../supabase/functions/_shared/reto.ts'
import assert from 'node:assert/strict'

const est = sanitizar({
  carrera: 'Ingeniería Industrial', ciclo: '8vo ciclo',
  habilidades: [{ nombre: 'Costos y presupuestos', nivel: 'avanzado' }, { nombre: 'Análisis de datos', nivel: 'intermedio' }],
  herramientas: [{ nombre: 'Excel avanzado', nivel: 'avanzado' }, { nombre: 'Power BI', nivel: 'intermedio' }],
  idiomas: [{ idioma: 'Inglés', nivel: 'B1' }],
  experiencia: [{ tipo: 'proyecto', descripcion: 'Modelo de simulación Monte Carlo en @RISK', meses: 4 }]
})
const sinnada = sanitizar({})

const oferta = sanitizarRequisitos({
  rubro: 'costos_finanzas', habilidades_obligatorias: ['costos', 'presupuestos'], habilidades_deseables: ['análisis de datos'],
  herramientas: ['Excel', 'SAP'], idioma_min: 'B1', ciclo_min: 7, modalidad: 'Híbrido', subvencion: 1300
}, 'practica')
assert.equal(oferta.modalidad, 'hibrido')
assert.equal(oferta.idioma_min, 'b1')

const a = matchOferta(est, 'costos_finanzas', oferta, 'practica')
const b = matchOferta(sinnada, 'costos_finanzas', oferta, 'practica')
console.log('estudiante fuerte', a, '\nvacío', b.score)
assert.ok(a.score >= 75, 'buen candidato debe pasar de 75')
assert.ok(b.score <= 30, 'candidato vacío debe quedar bajo')
assert.ok(a.coincide.includes('costos') && a.falta.includes('SAP'))

// Idioma insuficiente baja el match y avisa
const exigente = { ...oferta, idioma_min: 'c1' }
const c = matchOferta(est, 'costos_finanzas', exigente, 'practica')
assert.ok(c.score < a.score && c.notas.some(n => n.includes('inglés')))

// Ciclo mínimo
assert.ok(matchOferta(est, 'costos_finanzas', { ...oferta, ciclo_min: 10 }, 'practica').notas.some(n => n.includes('ciclo')))

// Curso: recomienda lo que te falta y no lo que ya dominas
const cursoSAP = sanitizarRequisitos({ rubro: 'costos_finanzas', ensena: ['SAP', 'Python'] }, 'curso')
const cursoExcel = sanitizarRequisitos({ rubro: 'costos_finanzas', ensena: ['Excel avanzado', 'Costos y presupuestos'] }, 'curso')
const m1 = matchOferta(est, 'costos_finanzas', cursoSAP, 'curso')
const m2 = matchOferta(est, 'costos_finanzas', cursoExcel, 'curso')
console.log('curso que falta', m1.score, 'curso que ya sabe', m2.score)
assert.ok(m1.score > 60 && m2.score < 40 && m2.notas.some(n => n.includes('dominas')))
// Inglés bajo: curso de inglés sube
const ingles = sanitizarRequisitos({ ensena: ['Inglés para entrevistas'] }, 'curso')
const bajo = sanitizar({ idiomas: [{ idioma: 'Inglés', nivel: 'A2' }] })
assert.ok(matchOferta(bajo, 'costos_finanzas', ingles, 'curso').score >= 50)

// Voluntariado funciona como práctica
assert.ok(matchOferta(est, 'costos_finanzas', sanitizarRequisitos({ habilidades_obligatorias: ['costos'] }, 'voluntariado'), 'voluntariado').score > 60)

// Sanitizar requisitos: basura no pasa
const sucio = sanitizarRequisitos({ rubro: 'inventado', habilidades_obligatorias: ['x'.repeat(200), 5, null], idioma_min: 'zzz', ciclo_min: 99, subvencion: -5, modalidad: 'luna', ensena: 'no es lista' }, 'curso')
assert.equal(sucio.rubro, null); assert.equal(sucio.idioma_min, null); assert.equal(sucio.ciclo_min, null)
assert.equal(sucio.subvencion, null); assert.equal(sucio.modalidad, null); assert.equal(sucio.habilidades_obligatorias[0].length, 60)
// curso sin "ensena" usa las habilidades
assert.deepEqual(sanitizarRequisitos({ habilidades_obligatorias: ['SAP'] }, 'curso').ensena, ['SAP'])

// ---- Retos
const pregs = sanitizarPreguntas([
  { pregunta: '¿Qué es un costo fijo?', opciones: ['Cambia con la producción', 'No cambia con la producción', 'Es un gasto de venta', 'Es un impuesto'], correcta: 1 },
  { pregunta: 'Mala: opciones repetidas', opciones: ['a', 'a', 'b', 'c'], correcta: 0 },
  { pregunta: 'Mala: correcta fuera de rango', opciones: ['a', 'b', 'c', 'd'], correcta: 7 },
  { pregunta: '', opciones: ['a', 'b', 'c', 'd'], correcta: 0 },
  { pregunta: 'Mala: 3 opciones', opciones: ['a', 'b', 'c'], correcta: 0 },
  { pregunta: 'Segunda buena', opciones: ['uno', 'dos', 'tres', 'cuatro'], correcta: 3 }
])
assert.equal(pregs.length, 2, 'solo pasan las preguntas válidas')
assert.ok(!JSON.stringify(paraEstudiante(pregs)).includes('correcta'), 'el estudiante no recibe la respuesta')
assert.deepEqual(calificar(pregs, [1, 3], 60), { puntaje: 100, aprobado: true, correctas: 2, total: 2 })
assert.equal(calificar(pregs, [1, 0], 60).puntaje, 50)
assert.equal(calificar(pregs, [1, 0], 60).aprobado, false)
assert.equal(calificar(pregs, 'basura', 60).puntaje, 0)
assert.equal(sanitizarPreguntas(Array(20).fill({ pregunta: 'p', opciones: ['a', 'b', 'c', 'd'], correcta: 0 })).length, 8)

// Lista corta
const cands = [
  { id: 'a', match: 90, reto: 50, aprobado: false, estado: 'interesado' },
  { id: 'b', match: 70, reto: 90, aprobado: true, estado: 'reto_aprobado' },
  { id: 'c', match: 85, reto: 80, aprobado: true, estado: 'reto_aprobado' },
  { id: 'd', match: 99, reto: 100, aprobado: true, estado: 'descartado' },
  { id: 'e', match: 60, reto: null, aprobado: null, estado: 'interesado' }
]
assert.deepEqual([...listaCorta(cands, true, 2)].sort(), ['b', 'c'], 'con reto: solo aprobados, sin descartados')
assert.deepEqual([...listaCorta(cands, false, 2)].sort(), ['a', 'c'], 'sin reto: mejores por match')
assert.equal(combinado(80, null), 80); assert.equal(combinado(80, 60), 70)
console.log('OK: pruebas de match y retos pasaron')

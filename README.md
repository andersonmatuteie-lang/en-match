# EN-MATCH

Plataforma que conecta a estudiantes y egresados con su primera práctica, cursos y voluntariados.
Prototipo del Laboratorio de Emprendimientos 2026.

- **Estudiante:** sube su CV, una IA lo lee y calcula su puntaje por rubro; desliza ofertas ordenadas por match y resuelve retos.
- **Empresa, ONG y cursos:** publican en texto libre, reciben candidatos ordenados por match y por reto, y pasan a entrevista solo a una lista corta.
- **Administración:** verifica a las organizaciones por RUC.

Sin configuración, `index.html` funciona en **modo demostración** con datos de ejemplo. Para activar cuentas reales, IA y base de datos, sigue [`supabase/README.md`](supabase/README.md).

| Archivo | Qué es |
|---|---|
| `index.html` | Interfaz y lógica principal |
| `match.js` | Descubrir con tarjetas, postulaciones, ofertas, candidatos, retos y verificación |
| `config.js` | Dirección y clave pública del servidor (vacío = modo demostración) |
| `privacidad.html` | Borrador de política de privacidad (requiere revisión legal) |
| `supabase/` | Esquema SQL y funciones del servidor |
| `tests/` | Pruebas del puntaje, el match, los retos, la base de datos y las funciones |

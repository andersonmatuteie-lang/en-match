// Configuración pública de EN-MATCH. La "anon key" es pública por diseño (la seguridad la dan las reglas RLS del schema.sql).
// NUNCA pongas aquí la clave de Anthropic ni la service_role.
// Si dejas esto vacío, la página funciona en modo demostración con datos de ejemplo.
window.ENMATCH_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};

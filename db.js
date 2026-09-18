// Database selector.
// - Local development: no database setup required; data is stored as JSON in .local-data/.
// - Vercel/Supabase: if a POSTGRES_* connection string exists, use PostgreSQL.
const hasPostgres = !!(
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING
);

module.exports = hasPostgres ? require('./db-postgres') : require('./db-local');

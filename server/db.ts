
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;
const DB_SESSION_TIMEZONE = "UTC";
const TIMEZONE_CRITICAL_COLUMNS = [
  { table: "orders", column: "created_at" },
  { table: "orders", column: "closed_at" },
  { table: "receipt_payments", column: "created_at" },
  { table: "receipts", column: "closed_at" },
  { table: "receipts", column: "created_at" },
  { table: "receipts", column: "updated_at" },
  { table: "users", column: "created_at" },
] as const;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Force the database session timezone to UTC.
// - We store timestamps as timestamptz in the DB (exact instant).
// - The frontend formats them for America/Sao_Paulo.
// This avoids the classic "3 hours behind" bug caused by tz-naive timestamps.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // pg passes this to libpq as: -c timezone=UTC
  options: `-c timezone=${DB_SESSION_TIMEZONE}`,
});

pool.on("connect", (client) => {
  // Keep this as a runtime guardrail in case `options` is ignored by proxies.
  void client.query(`SET TIME ZONE '${DB_SESSION_TIMEZONE}'`).catch((err) => {
    console.error(`[db] Failed to set session timezone to ${DB_SESSION_TIMEZONE}:`, err);
  });
});

function buildExpectedColumnsSql() {
  return TIMEZONE_CRITICAL_COLUMNS
    .map((_, idx) => `($${idx * 2 + 1}::text, $${idx * 2 + 2}::text)`)
    .join(", ");
}

export async function assertTimezoneSafeSchema(): Promise<void> {
  const values = TIMEZONE_CRITICAL_COLUMNS.flatMap(({ table, column }) => [table, column]);
  const expectedColumnsSql = buildExpectedColumnsSql();

  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string | null;
  }>(
    `
      WITH expected(table_name, column_name) AS (
        VALUES ${expectedColumnsSql}
      )
      SELECT
        e.table_name,
        e.column_name,
        c.data_type
      FROM expected e
      LEFT JOIN information_schema.columns c
        ON c.table_schema = current_schema()
       AND c.table_name = e.table_name
       AND c.column_name = e.column_name
      WHERE c.column_name IS NULL
         OR c.data_type <> 'timestamp with time zone'
      ORDER BY e.table_name, e.column_name;
    `,
    values,
  );

  if (rows.length === 0) return;

  const details = rows
    .map((row) => `${row.table_name}.${row.column_name} (${row.data_type ?? "missing"})`)
    .join(", ");

  throw new Error(
    `[db] Legacy datetime schema detected: ${details}. Run "npm run db:push" (if needed) and apply the latest migrations (0003/0005) before starting the backend.`,
  );
}

export async function assertOrdersComandaForeignKey(): Promise<void> {
  const { rows } = await pool.query<{
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
  }>(
    `
      SELECT
        src.relname AS source_table,
        src_attr.attname AS source_column,
        tgt.relname AS target_table,
        tgt_attr.attname AS target_column
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_attribute src_attr
        ON src_attr.attrelid = con.conrelid
       AND src_attr.attnum = con.conkey[1]
      JOIN pg_attribute tgt_attr
        ON tgt_attr.attrelid = con.confrelid
       AND tgt_attr.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND src_ns.nspname = current_schema()
        AND src.relname = 'orders'
        AND src_attr.attname = 'comanda_id'
        AND tgt.relname = 'comandas'
        AND tgt_attr.attname = 'id'
      LIMIT 1;
    `,
  );

  if (rows.length > 0) return;

  throw new Error(
    `[db] orders.comanda_id is not a FK to comandas.id. Apply migrations/0004_orders_comanda_fk_to_comandas_id.sql before starting the backend.`,
  );
}

export const db = drizzle(pool, { schema });

import mysql from 'mysql2/promise';
import { SeedError } from './util.mjs';

export async function connect(config) {
  try {
    return await mysql.createConnection({ uri: config.databaseUrl, connectTimeout: 10000 });
  } catch (error) {
    throw new SeedError(
      `Could not connect to MySQL (${error.code ?? error.message}). Is the local stack up? Try: npm run all`
    );
  }
}

// One connection for the whole transaction: through a pool each statement can
// land on a different connection (AGENTS.md rule 6).
export async function transaction(conn, work) {
  await conn.beginTransaction();
  try {
    const result = await work();
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

// "?,?,?" for a dynamic IN (...) list; pass the values separately (rule 7).
export const placeholders = (values) => values.map(() => '?').join(',');

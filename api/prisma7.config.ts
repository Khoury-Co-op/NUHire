import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// dbmate owns the schema (database-files/migrations); Prisma only reads it. After
// a migration, run `npm run db:pull` and commit the result. There is no
// `migrations` block on purpose: `prisma migrate` and `db push` are not used here.
//
// Prisma 7 looks for `prisma7.config.ts`; a file named `prisma.config.ts` is
// ignored. Prisma is pinned to 7: ignore the CLI's prompt to install
// prisma@latest, which is Prisma 8 and does not support MySQL yet.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
// One workspace behind Sites owner-only access. Add per-user authorization before making public.
export const studios = sqliteTable("relai_studios", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

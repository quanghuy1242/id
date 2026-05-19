// This file deliberately imports drizzle-orm from domain/ to trigger architecture/layer-imports
import { sql } from "drizzle-orm";

export function broken() {
  return sql`SELECT 1`;
}

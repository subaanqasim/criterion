import { createSchema, sql } from "../src/database.js";

try {
  await createSchema();
  console.log("Database schema is ready");
} finally {
  await sql.end();
}

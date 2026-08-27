import { embedDocuments } from "../src/embeddings.js";
import { createSchema, sql } from "../src/database.js";

const batchSize = Number(process.env.EMBED_BATCH_SIZE ?? 100);
const delayMs = Number(process.env.EMBED_DELAY_MS ?? 1000);

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error("EMBED_BATCH_SIZE must be a positive integer");
}
if (!Number.isInteger(delayMs) || delayMs < 0) {
  throw new Error("EMBED_DELAY_MS must be a non-negative integer");
}

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
}

const pause = () => new Promise((resolve) => setTimeout(resolve, delayMs));

async function embedQuran() {
  let total = 0;
  while (true) {
    const rows = await sql<
      Array<{ surahNumber: number; ayahNumber: number; content: string }>
    >`
      SELECT
        verse.surah_number AS "surahNumber",
        verse.ayah_number AS "ayahNumber",
        verse.text_english AS content
      FROM quran_verses verse
      LEFT JOIN quran_embeddings stored USING (surah_number, ayah_number)
      WHERE stored.surah_number IS NULL
      ORDER BY verse.surah_number, verse.ayah_number
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) {
      break;
    }

    const embeddings = await embedDocuments(rows.map((row) => row.content));
    const inserts = rows.map((row, index) => ({
      surah_number: row.surahNumber,
      ayah_number: row.ayahNumber,
      embedding: JSON.stringify(embeddings[index]),
    }));
    await sql`
      INSERT INTO quran_embeddings ${sql(inserts)}
      ON CONFLICT (surah_number, ayah_number) DO UPDATE
      SET embedding = excluded.embedding
    `;
    total += rows.length;
    console.log(`Embedded ${total} Quran verses`);
    await pause();
  }
}

async function embedHadiths() {
  let total = 0;
  while (true) {
    const rows = await sql<
      Array<{ collection: string; hadithNumber: number; content: string }>
    >`
      SELECT
        hadith.collection,
        hadith.hadith_number AS "hadithNumber",
        COALESCE(NULLIF(trim(hadith.english_text), ''), hadith.reference) AS content
      FROM hadiths hadith
      LEFT JOIN hadith_embeddings stored USING (collection, hadith_number)
      WHERE stored.collection IS NULL
      ORDER BY hadith.collection, hadith.hadith_number
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) {
      break;
    }

    const embeddings = await embedDocuments(rows.map((row) => row.content));
    const inserts = rows.map((row, index) => ({
      collection: row.collection,
      hadith_number: row.hadithNumber,
      embedding: JSON.stringify(embeddings[index]),
    }));
    await sql`
      INSERT INTO hadith_embeddings ${sql(inserts)}
      ON CONFLICT (collection, hadith_number) DO UPDATE
      SET embedding = excluded.embedding
    `;
    total += rows.length;
    console.log(`Embedded ${total} Hadith records`);
    await pause();
  }
}

try {
  await createSchema();
  await embedQuran();
  await embedHadiths();
  console.log("Embedding generation is complete");
} finally {
  await sql.end();
}

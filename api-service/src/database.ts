import postgres from "postgres";

const databaseUrl = process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("POSTGRES_URL is required");
}

export const sql = postgres(databaseUrl, {
  connect_timeout: 15,
  idle_timeout: 20,
  max: 10,
});

export async function createSchema() {
  await sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(2046271991)`;
    await transaction`CREATE EXTENSION IF NOT EXISTS vector`;

    await transaction`
      CREATE TABLE IF NOT EXISTS quran_verses (
        verse_id uuid NOT NULL DEFAULT gen_random_uuid(),
        surah_number integer NOT NULL,
        ayah_number integer NOT NULL,
        surah_name_english text NOT NULL,
        surah_name_arabic text NOT NULL,
        text_arabic text NOT NULL,
        text_english text NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('english', text_english)
        ) STORED,
        PRIMARY KEY (surah_number, ayah_number)
      )
    `;
    await transaction`
      ALTER TABLE quran_verses
      ADD COLUMN IF NOT EXISTS verse_id uuid DEFAULT gen_random_uuid()
    `;
    await transaction`
      UPDATE quran_verses
      SET verse_id = gen_random_uuid()
      WHERE verse_id IS NULL
    `;
    await transaction`
      ALTER TABLE quran_verses
      ALTER COLUMN verse_id SET DEFAULT gen_random_uuid(),
      ALTER COLUMN verse_id SET NOT NULL
    `;
    await transaction`
      CREATE UNIQUE INDEX IF NOT EXISTS quran_verses_verse_id_idx
      ON quran_verses (verse_id)
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS quran_verses_search_idx
      ON quran_verses USING gin (search_vector)
    `;

    await transaction`
      CREATE TABLE IF NOT EXISTS quran_embeddings (
        surah_number integer NOT NULL,
        ayah_number integer NOT NULL,
        embedding vector(768) NOT NULL,
        PRIMARY KEY (surah_number, ayah_number),
        FOREIGN KEY (surah_number, ayah_number)
          REFERENCES quran_verses (surah_number, ayah_number)
          ON DELETE CASCADE
      )
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS quran_embeddings_hnsw_idx
      ON quran_embeddings USING hnsw (embedding vector_cosine_ops)
    `;

    await transaction`
      CREATE TABLE IF NOT EXISTS hadiths (
        collection text NOT NULL,
        collection_name text NOT NULL,
        hadith_number integer NOT NULL,
        reference text NOT NULL,
        english_text text NOT NULL,
        arabic_text text NOT NULL,
        book_number integer,
        book_name text,
        chapter_number integer,
        chapter_name text,
        grade text,
        narrator_chain text,
        source_url text,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('english', english_text)
        ) STORED,
        PRIMARY KEY (collection, hadith_number)
      )
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS hadiths_search_idx
      ON hadiths USING gin (search_vector)
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS hadiths_grade_idx
      ON hadiths (grade)
    `;

    await transaction`
      CREATE TABLE IF NOT EXISTS hadith_embeddings (
        collection text NOT NULL,
        hadith_number integer NOT NULL,
        embedding vector(768) NOT NULL,
        PRIMARY KEY (collection, hadith_number),
        FOREIGN KEY (collection, hadith_number)
          REFERENCES hadiths (collection, hadith_number)
          ON DELETE CASCADE
      )
    `;
    await transaction`
      CREATE INDEX IF NOT EXISTS hadith_embeddings_hnsw_idx
      ON hadith_embeddings USING hnsw (embedding vector_cosine_ops)
    `;
  });
}

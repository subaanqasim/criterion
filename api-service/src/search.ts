import { embedQuery, semanticSearchEnabled } from "./embeddings.js";
import { sql } from "./database.js";

type SearchMode = "semantic" | "lexical";
type GradePreference = "sahih-only" | "sahih-and-hasan" | "all";

type QuranRow = {
  verseId: string;
  surahNumber: number;
  ayahNumber: number;
  surahNameEnglish: string;
  surahNameArabic: string;
  textArabic: string;
  textEnglish: string;
  similarity: number;
};

type ContextRow = Pick<
  QuranRow,
  "surahNumber" | "ayahNumber" | "textArabic" | "textEnglish"
>;

type HadithRow = {
  collection: string;
  collectionName: string;
  hadithNumber: number;
  reference: string;
  englishText: string;
  arabicText: string;
  bookName: string | null;
  chapterName: string | null;
  grade: string | null;
  narratorChain: string | null;
  sourceUrl: string | null;
  similarity: number;
};

const coverageCache = new Map<string, { complete: boolean; expiresAt: number }>();

async function hasCompleteEmbeddingCoverage(source: "quran" | "hadith") {
  const cached = coverageCache.get(source);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.complete;
  }

  const [counts] =
    source === "quran"
      ? await sql<Array<{ documents: number; embeddings: number }>>`
          SELECT
            (SELECT count(*)::integer FROM quran_verses) AS documents,
            (SELECT count(*)::integer FROM quran_embeddings) AS embeddings
        `
      : await sql<Array<{ documents: number; embeddings: number }>>`
          SELECT
            (SELECT count(*)::integer FROM hadiths) AS documents,
            (SELECT count(*)::integer FROM hadith_embeddings) AS embeddings
        `;
  const complete = Boolean(
    counts && counts.documents > 0 && counts.documents === counts.embeddings
  );
  coverageCache.set(source, { complete, expiresAt: Date.now() + 60_000 });
  return complete;
}

async function searchQuranLexically(query: string, limit: number) {
  return sql<QuranRow[]>`
    WITH search AS (
      SELECT websearch_to_tsquery('english', ${query}) AS query
    ), ranked AS (
      SELECT
        verse.*,
        ts_rank_cd(verse.search_vector, search.query) AS rank
      FROM quran_verses verse, search
      WHERE verse.search_vector @@ search.query
    )
    SELECT
      verse_id AS "verseId",
      surah_number AS "surahNumber",
      ayah_number AS "ayahNumber",
      surah_name_english AS "surahNameEnglish",
      surah_name_arabic AS "surahNameArabic",
      text_arabic AS "textArabic",
      text_english AS "textEnglish",
      rank / (rank + 1) AS similarity
    FROM ranked
    ORDER BY rank DESC
    LIMIT ${limit}
  `;
}

async function searchQuranSemantically(query: string, limit: number) {
  const embedding = JSON.stringify(await embedQuery(query));
  return sql<QuranRow[]>`
    SELECT
      verse.verse_id AS "verseId",
      verse.surah_number AS "surahNumber",
      verse.ayah_number AS "ayahNumber",
      verse.surah_name_english AS "surahNameEnglish",
      verse.surah_name_arabic AS "surahNameArabic",
      verse.text_arabic AS "textArabic",
      verse.text_english AS "textEnglish",
      1 - (stored.embedding <=> ${embedding}::vector) AS similarity
    FROM quran_embeddings stored
    JOIN quran_verses verse USING (surah_number, ayah_number)
    WHERE 1 - (stored.embedding <=> ${embedding}::vector) > 0.3
    ORDER BY stored.embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `;
}

async function addQuranContext(rows: QuranRow[]) {
  return Promise.all(
    rows.map(async (row, index) => {
      if (index >= 3) {
        return { ...row, hasContext: false, contextBefore: [], contextAfter: [] };
      }

      const context = await sql<ContextRow[]>`
        SELECT
          surah_number AS "surahNumber",
          ayah_number AS "ayahNumber",
          text_arabic AS "textArabic",
          text_english AS "textEnglish"
        FROM quran_verses
        WHERE surah_number = ${row.surahNumber}
          AND ayah_number BETWEEN ${row.ayahNumber - 2} AND ${row.ayahNumber + 2}
          AND ayah_number != ${row.ayahNumber}
        ORDER BY ayah_number
      `;

      return {
        ...row,
        hasContext: true,
        contextBefore: context.filter((item) => item.ayahNumber < row.ayahNumber),
        contextAfter: context.filter((item) => item.ayahNumber > row.ayahNumber),
      };
    })
  );
}

export async function searchQuran(query: string, limit: number) {
  let rows: QuranRow[] = [];
  let mode: SearchMode = "lexical";

  if (semanticSearchEnabled() && (await hasCompleteEmbeddingCoverage("quran"))) {
    try {
      rows = await searchQuranSemantically(query, limit);
      mode = rows.length > 0 ? "semantic" : "lexical";
    } catch (error) {
      console.warn("Semantic Quran search failed; using full-text search", error);
    }
  }

  if (mode === "lexical") {
    rows = await searchQuranLexically(query, limit);
  }

  return { results: await addQuranContext(rows), mode };
}

function gradeFilter(grade: GradePreference) {
  if (grade === "sahih-only") {
    return sql`AND hadith.grade ILIKE 'Sahih%'`;
  }
  if (grade === "sahih-and-hasan") {
    return sql`AND (hadith.grade ILIKE 'Sahih%' OR hadith.grade ILIKE 'Hasan%')`;
  }
  return sql``;
}

function collectionFilter(collections?: string[]) {
  return collections?.length
    ? sql`AND hadith.collection IN ${sql(collections)}`
    : sql``;
}

async function searchHadithsLexically(
  query: string,
  options: { collections?: string[]; grade: GradePreference; limit: number }
) {
  return sql<HadithRow[]>`
    WITH search AS (
      SELECT websearch_to_tsquery('english', ${query}) AS query
    ), ranked AS (
      SELECT
        hadith.*,
        ts_rank_cd(hadith.search_vector, search.query) AS rank
      FROM hadiths hadith, search
      WHERE hadith.search_vector @@ search.query
        ${collectionFilter(options.collections)}
        ${gradeFilter(options.grade)}
    )
    SELECT
      collection,
      collection_name AS "collectionName",
      hadith_number AS "hadithNumber",
      reference,
      english_text AS "englishText",
      arabic_text AS "arabicText",
      book_name AS "bookName",
      chapter_name AS "chapterName",
      grade,
      narrator_chain AS "narratorChain",
      source_url AS "sourceUrl",
      rank / (rank + 1) AS similarity
    FROM ranked
    ORDER BY rank DESC
    LIMIT ${options.limit}
  `;
}

async function searchHadithsSemantically(
  query: string,
  options: { collections?: string[]; grade: GradePreference; limit: number }
) {
  const embedding = JSON.stringify(await embedQuery(query));
  return sql<HadithRow[]>`
    SELECT
      hadith.collection,
      hadith.collection_name AS "collectionName",
      hadith.hadith_number AS "hadithNumber",
      hadith.reference,
      hadith.english_text AS "englishText",
      hadith.arabic_text AS "arabicText",
      hadith.book_name AS "bookName",
      hadith.chapter_name AS "chapterName",
      hadith.grade,
      hadith.narrator_chain AS "narratorChain",
      hadith.source_url AS "sourceUrl",
      1 - (stored.embedding <=> ${embedding}::vector) AS similarity
    FROM hadith_embeddings stored
    JOIN hadiths hadith USING (collection, hadith_number)
    WHERE 1 - (stored.embedding <=> ${embedding}::vector) > 0.3
      ${collectionFilter(options.collections)}
      ${gradeFilter(options.grade)}
    ORDER BY stored.embedding <=> ${embedding}::vector
    LIMIT ${options.limit}
  `;
}

export async function searchHadiths(
  query: string,
  options: { collections?: string[]; grade: GradePreference; limit: number }
) {
  let rows: HadithRow[] = [];
  let mode: SearchMode = "lexical";

  if (semanticSearchEnabled() && (await hasCompleteEmbeddingCoverage("hadith"))) {
    try {
      rows = await searchHadithsSemantically(query, options);
      mode = rows.length > 0 ? "semantic" : "lexical";
    } catch (error) {
      console.warn("Semantic Hadith search failed; using full-text search", error);
    }
  }

  if (mode === "lexical") {
    rows = await searchHadithsLexically(query, options);
  }

  return { results: rows, mode };
}

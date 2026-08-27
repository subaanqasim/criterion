import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema, sql } from "../src/database.js";
import { surahNames } from "../src/surah-names.js";

type HadithSource = {
  collection: string;
  collection_name: string;
  hadith_number: number;
  reference: string;
  english_text: string;
  arabic_text: string;
  book_number?: number | null;
  book_name?: string | null;
  chapter_number?: number | null;
  chapter_name?: string | null;
  grade?: string | null;
  narrator_chain?: string | null;
  source_url?: string | null;
};

type HadithFile = { hadiths: HadithSource[] };

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const dataDirectory = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(scriptDirectory, "../../../data");

function parseQuran(content: string) {
  return new Map(
    content
      .trim()
      .split("\n")
      .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith("#"))
      .map((line) => {
        const [surah, ayah, text] = line.split("|");
        if (!surah || !ayah || text === undefined) {
          throw new Error(`Invalid Quran row: ${line}`);
        }
        return [`${Number(surah)}:${Number(ayah)}`, text.trim()] as const;
      })
  );
}

async function seedQuran() {
  const [english, arabic] = await Promise.all([
    readFile(resolve(dataDirectory, "quran.txt"), "utf8"),
    readFile(resolve(dataDirectory, "quran-arabic.txt"), "utf8"),
  ]);
  const englishVerses = parseQuran(english);
  const arabicVerses = parseQuran(arabic);
  const rows = [...englishVerses].map(([key, textEnglish]) => {
    const [surahNumber, ayahNumber] = key.split(":").map(Number);
    const names = surahNames[surahNumber ?? 0];
    if (!surahNumber || !ayahNumber || !names) {
      throw new Error(`Invalid Quran reference: ${key}`);
    }

    return {
      surah_number: surahNumber,
      ayah_number: ayahNumber,
      surah_name_english: names.english,
      surah_name_arabic: names.arabic,
      text_arabic: arabicVerses.get(key) ?? "",
      text_english: textEnglish,
    };
  });

  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    await sql`
      INSERT INTO quran_verses ${sql(batch)}
      ON CONFLICT (surah_number, ayah_number) DO UPDATE SET
        surah_name_english = excluded.surah_name_english,
        surah_name_arabic = excluded.surah_name_arabic,
        text_arabic = excluded.text_arabic,
        text_english = excluded.text_english
    `;
  }

  console.log(`Seeded ${rows.length} Quran verses`);
}

async function seedHadiths() {
  const files = [
    "bukhari-full.json",
    "muslim-full.json",
    "tirmidhi-full.json",
    "abudawud-full.json",
    "nawawi40-full.json",
    "riyadussalihin-full.json",
  ];
  let count = 0;

  for (const filename of files) {
    const parsed = JSON.parse(
      await readFile(resolve(dataDirectory, filename), "utf8")
    ) as HadithFile;
    const rows = parsed.hadiths.map((hadith) => ({
      collection: hadith.collection,
      collection_name: hadith.collection_name,
      hadith_number: hadith.hadith_number,
      reference: hadith.reference,
      english_text: hadith.english_text,
      arabic_text: hadith.arabic_text,
      book_number: hadith.book_number ?? null,
      book_name: hadith.book_name ?? null,
      chapter_number: hadith.chapter_number ?? null,
      chapter_name: hadith.chapter_name ?? null,
      grade: hadith.grade ?? null,
      narrator_chain: hadith.narrator_chain ?? null,
      source_url: hadith.source_url ?? null,
    }));

    for (let index = 0; index < rows.length; index += 250) {
      const batch = rows.slice(index, index + 250);
      await sql`
        INSERT INTO hadiths ${sql(batch)}
        ON CONFLICT (collection, hadith_number) DO UPDATE SET
          collection_name = excluded.collection_name,
          reference = excluded.reference,
          english_text = excluded.english_text,
          arabic_text = excluded.arabic_text,
          book_number = excluded.book_number,
          book_name = excluded.book_name,
          chapter_number = excluded.chapter_number,
          chapter_name = excluded.chapter_name,
          grade = excluded.grade,
          narrator_chain = excluded.narrator_chain,
          source_url = excluded.source_url
      `;
    }

    count += rows.length;
    console.log(`Seeded ${rows.length} rows from ${filename}`);
  }

  console.log(`Seeded ${count} Hadith records`);
}

try {
  await createSchema();
  await seedQuran();
  await seedHadiths();
} finally {
  await sql.end();
}

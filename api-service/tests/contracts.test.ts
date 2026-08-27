import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHadithResponse,
  buildMetadata,
  buildQuranResponse,
} from "../src/contracts.js";
import { hadithSearchSchema, quranSearchSchema } from "../src/validation.js";

test("matches the original metadata response", () => {
  assert.deepEqual(buildMetadata("2026-08-26T00:00:00.000Z"), {
    status: "operational",
    version: "1.0.0",
    timestamp: "2026-08-26T00:00:00.000Z",
    endpoints: {
      quran: "/api/v1/quran/search",
      hadith: "/api/v1/hadith/search",
    },
    documentation: "https://criterion.life/developers",
    rateLimit: { window: "1 minute", maxRequests: 60 },
    features: {
      semantic_search: true,
      hybrid_search: true,
      context_verses: true,
      authenticity_filtering: true,
      cors_enabled: true,
    },
    data: {
      quran_verses: 6236,
      hadiths: 21641,
      collections: [
        "Sahih Bukhari",
        "Sahih Muslim",
        "Jami` at-Tirmidhi",
        "Sunan Abi Dawud",
        "40 Hadith Nawawi",
        "Riyad as-Salihin",
      ],
      languages: ["en"],
    },
  });
});

test("matches the original Quran response envelope", () => {
  const results = [{ verseId: "id", surahNumber: 2, ayahNumber: 153 }];
  assert.deepEqual(buildQuranResponse(results, " patience "), {
    results,
    query: "patience",
    count: 1,
  });
});

test("matches the original Hadith response envelope", () => {
  assert.deepEqual(
    buildHadithResponse(
      [
        {
          reference: "Sahih al-Bukhari 1",
          collectionName: "Sahih Bukhari",
          englishText: "Text",
          arabicText: "Arabic",
          grade: null,
          narratorChain: null,
          bookName: null,
          chapterName: null,
          sourceUrl: null,
          similarity: 0.8,
        },
      ],
      " charity ",
      ["bukhari"],
      "sahih-only"
    ),
    {
      results: [
        {
          reference: "Sahih al-Bukhari 1",
          collection: "Sahih Bukhari",
          english: "Text",
          arabic: "Arabic",
          grade: "Unknown",
          narrator: "Not specified",
          book: "Not specified",
          chapter: "Not specified",
          sourceUrl: "",
          similarity: 0.8,
        },
      ],
      query: "charity",
      count: 1,
      filters: {
        collections: ["Sahih Bukhari"],
        gradeFilter: "sahih-only",
      },
    }
  );
});

test("matches the original query parsing behavior", () => {
  assert.deepEqual(quranSearchSchema.parse({ q: "patience", limit: "5abc" }), {
    q: "patience",
    limit: 5,
    language: "en",
  });
  assert.deepEqual(hadithSearchSchema.parse({ q: "charity" }), {
    q: "charity",
    grade: "sahih-only",
    limit: 5,
  });
  assert.equal(
    hadithSearchSchema.safeParse({ q: "charity", collections: "tirmidhi" })
      .success,
    false
  );
  assert.deepEqual(
    hadithSearchSchema.parse({ q: "charity", collections: "" }),
    {
      q: "charity",
      collections: undefined,
      grade: "sahih-only",
      limit: 5,
    }
  );
});

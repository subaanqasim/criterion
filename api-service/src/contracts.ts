type HadithResult = {
  reference: string;
  collectionName: string;
  englishText: string;
  arabicText: string;
  grade: string | null;
  narratorChain: string | null;
  bookName: string | null;
  chapterName: string | null;
  sourceUrl: string | null;
  similarity: number;
};

export const collectionNames = {
  bukhari: "Sahih Bukhari",
  muslim: "Sahih Muslim",
  nawawi40: "40 Hadith Nawawi",
  riyadussalihin: "Riyad as-Salihin",
} as const;

export type Collection = keyof typeof collectionNames;

export function buildMetadata(timestamp = new Date().toISOString()) {
  return {
    status: "operational",
    version: "1.0.0",
    timestamp,
    endpoints: {
      quran: "/api/v1/quran/search",
      hadith: "/api/v1/hadith/search",
    },
    documentation: "https://criterion.life/developers",
    rateLimit: {
      window: "1 minute",
      maxRequests: 60,
    },
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
  };
}

export function buildQuranResponse(results: unknown[], query: string) {
  return {
    results,
    query: query.trim(),
    count: results.length,
  };
}

export function buildHadithResponse(
  results: HadithResult[],
  query: string,
  collections: Collection[] | undefined,
  grade: "sahih-only" | "sahih-and-hasan" | "all"
) {
  const formattedResults = results.map((hadith) => ({
    reference: hadith.reference,
    collection: hadith.collectionName,
    english: hadith.englishText,
    arabic: hadith.arabicText,
    grade: hadith.grade || "Unknown",
    narrator: hadith.narratorChain || "Not specified",
    book: hadith.bookName || "Not specified",
    chapter: hadith.chapterName || "Not specified",
    sourceUrl: hadith.sourceUrl || "",
    similarity: hadith.similarity,
  }));

  return {
    results: formattedResults,
    query: query.trim(),
    count: formattedResults.length,
    filters: {
      collections: collections
        ? collections.map((collection) => collectionNames[collection])
        : ["All collections"],
      gradeFilter: grade,
    },
  };
}

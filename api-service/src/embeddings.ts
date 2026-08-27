import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

const model = google.textEmbedding("gemini-embedding-001");

export function semanticSearchEnabled() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export async function embedQuery(value: string) {
  const result = await embed({
    model,
    value: value.replaceAll("\n", " ").trim(),
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: 768,
      },
    },
  });

  return result.embedding;
}

export async function embedDocuments(values: string[]) {
  const result = await embedMany({
    model,
    values: values.map((value) => value.replaceAll("\n", " ").trim()),
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: 768,
      },
    },
  });

  return result.embeddings;
}

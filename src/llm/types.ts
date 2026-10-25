import type { z } from "zod";

/** Tool yang bisa dipanggil model. Didefinisikan sekali, dipakai semua provider. */
export type Tool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  input: S;
  run: (input: z.infer<S>) => Promise<string>;
};

export const defineTool = <S extends z.ZodObject>(tool: Tool<S>): Tool => tool as unknown as Tool;

export type Image = { mediaType: string; /** base64 */ data: string };

/** Riwayat percakapan disimpan sebagai teks saja, supaya bisa pindah provider kapan aja. Gambar cuma buat giliran yang lagi jalan. */
export type Turn = { role: "user" | "assistant"; text: string; images?: Image[] };

export type RunOptions = {
  system: string;
  history: Turn[];
  tools: Tool[];
  maxIterations?: number;
};

export interface LLM {
  /** Jalankan loop tool-calling sampai model selesai, return jawaban akhir (teks). */
  run(opts: RunOptions): Promise<string>;
}

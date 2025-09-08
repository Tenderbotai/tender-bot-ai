import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabaseClient";
import OpenAI from "openai";

// Initialize OpenAI client once (safe because it uses env vars)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Example interface for tender rows — adjust to match your DB
interface TenderRow {
  id: string;
  description?: string;
  title?: string;
  // add more fields if needed
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseClient();
    const body = await req.json();

    // Example: insert incoming tender into Supabase
    const { data, error } = await supabase
      .from("tenders")
      .insert([body])
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tender: TenderRow | undefined = data?.[0];

    // Optionally summarize tender with OpenAI
    let ai_summary: string | undefined;
    if (tender?.description) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Summarize this government tender in 2 sentences.",
          },
          {
            role: "user",
            content: tender.description,
          },
        ],
      });

      ai_summary = response.choices[0]?.message?.content ?? "";
    }

    return NextResponse.json({
      success: true,
      tender,
      ai_summary,
    });
  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

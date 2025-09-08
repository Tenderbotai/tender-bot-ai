import { NextResponse } from "next/server"
import OpenAI from "openai"
import { getSupabaseClient } from "@/lib/supabase"

// --- Types ---
export interface TenderRow {
  id?: string
  source_id: string
  title?: string
  description?: string
  country?: string
  publication_date?: string
  deadline?: string | null
  raw_url?: string
  ai_summary?: string | null
}

interface Party {
  id?: string
  name?: string
  roles?: string[]
  address?: {
    countryName?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface Release {
  id?: string
  tender?: {
    title?: string
    description?: string
    tenderPeriod?: { endDate?: string }
  }
  parties?: Party[]
  date?: string
  [key: string]: unknown
}

interface OCDSResponse {
  releases?: Release[]
  [key: string]: unknown
}

// --- Supabase + OpenAI clients ---
const supabase = getSupabaseClient()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// --- Helpers ---
async function summarize(text: string): Promise<string | null> {
  if (!text) return null
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Summarize this government tender in 1–2 sentences, highlighting buyer, scope, and deadlines.",
        },
        { role: "user", content: text },
      ],
    })
    return resp.choices[0]?.message?.content ?? null
  } catch (err) {
    console.error("Summarize error:", err)
    return null
  }
}

// --- Main Ingest ---
export async function GET() {
  const cursorKey = "ocds_cursor"

  const getCursor = async (): Promise<string | null> => {
    const { data } = await supabase
      .from("cursors")
      .select("value")
      .eq("key", cursorKey)
      .maybeSingle()
    return data?.value ?? null
  }

  const setCursor = async (val: string): Promise<void> => {
    await supabase.from("cursors").upsert({ key: cursorKey, value: val })
  }

  try {
    const cursor = await getCursor()
    const url = new URL("https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search")
    url.searchParams.set("pageSize", "10")
    if (cursor) url.searchParams.set("cursor", cursor)

    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(`OCDS fetch failed: ${resp.status}`)

    const data = (await resp.json()) as OCDSResponse
    const releases = data.releases ?? []

    for (const rel of releases) {
      const parties = rel.parties ?? []
      const buyerCountry =
        parties.find((p) => p.roles?.includes("buyer"))?.address?.countryName ?? null

      const ai_summary = await summarize(String(rel.tender?.description ?? ""))

      const tender: TenderRow = {
        source_id: rel.id ?? crypto.randomUUID(),
        title: rel.tender?.title,
        description: rel.tender?.description,
        country: buyerCountry ?? undefined,
        publication_date: rel.date,
        deadline: rel.tender?.tenderPeriod?.endDate ?? null,
        raw_url: undefined, // add mapping if OCDS provides URL
        ai_summary,
      }

      await supabase.from("tenders").upsert(tender, { onConflict: "source_id" })
    }

    // update cursor if API provides it
    const nextCursor = resp.headers.get("x-next-cursor") ?? null
    if (nextCursor) await setCursor(nextCursor)

    return NextResponse.json({ inserted: releases.length })
  } catch (err) {
    console.error("Ingest error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}


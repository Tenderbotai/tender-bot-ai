// src/app/search/page.tsx
import { createClient } from "@supabase/supabase-js"

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // ✅ Next.js 15+ passes searchParams as a Promise
  const params = await searchParams
  const q = typeof params.q === "string" ? params.q : undefined
  const country = typeof params.country === "string" ? params.country : undefined

  // ✅ Supabase server-side client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE! // ⚠️ service role: server only
  )

  // Build query
  let query = supabase.from("tenders").select("*").order("publication_date", { ascending: false }).limit(20)

  if (q) {
    query = query.ilike("title", `%${q}%`)
  }
  if (country) {
    query = query.eq("country", country)
  }

  const { data: tenders, error } = await query
  if (error) {
    console.error("Supabase query error:", error.message)
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tender Search</h1>

      {/* Search filters */}
      <form method="GET" className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium">Keyword</label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search tenders..."
            className="border rounded-md w-full p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Country</label>
          <input
            type="text"
            name="country"
            defaultValue={country}
            placeholder="e.g. UK"
            className="border rounded-md w-full p-2"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Search
        </button>
      </form>

      {/* Results */}
      <div className="space-y-4">
        {tenders && tenders.length > 0 ? (
          tenders.map((tender) => (
            <div key={tender.source + tender.source_id} className="p-4 border rounded-lg">
              <h2 className="text-lg font-semibold">{tender.title}</h2>
              <p className="text-sm text-gray-600">{tender.country}</p>
              <p className="mt-2">{tender.description}</p>
              {tender.ai_summary && (
                <p className="mt-2 italic text-gray-700">💡 {tender.ai_summary}</p>
              )}
              <a
                href={tender.raw_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-blue-600 hover:underline"
              >
                View Notice →
              </a>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No tenders found. Try a different search.</p>
        )}
      </div>
    </main>
  )
}


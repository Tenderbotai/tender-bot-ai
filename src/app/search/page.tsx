// src/app/search/page.tsx
import { Suspense } from "react"

interface SearchPageProps {
  searchParams?: Record<string, string | string[] | undefined>
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  // Safely extract query params
  const q =
    typeof searchParams?.q === "string" ? searchParams.q : undefined
  const country =
    typeof searchParams?.country === "string" ? searchParams.country : undefined

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

      {/* Results (placeholder, replace with Supabase query later) */}
      <Suspense fallback={<p>Loading results...</p>}>
        <div className="space-y-4">
          {q || country ? (
            <div className="p-4 border rounded-lg">
              <h2 className="text-lg font-semibold">Example Tender</h2>
              <p>Showing results for: {q || "—"}</p>
              <p>Country filter: {country || "—"}</p>
            </div>
          ) : (
            <p className="text-gray-500">Enter a search above.</p>
          )}
        </div>
      </Suspense>
    </main>
  )
}

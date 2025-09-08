// src/app/tender/[id]/page.tsx
import { createClient } from "@supabase/supabase-js"

export default async function TenderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE! // ⚠️ server-only
  )

  const { data: tender, error } = await supabase
    .from("tenders")
    .select("*")
    .eq("source_id", id)
    .single()

  if (error || !tender) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-bold">Tender not found</h1>
        <p className="text-gray-600">{error?.message}</p>
      </main>
    )
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{tender.title}</h1>
      <p className="text-gray-600">{tender.country}</p>
      <p>{tender.description}</p>

      {tender.ai_summary && (
        <p className="italic text-gray-700">💡 {tender.ai_summary}</p>
      )}

      <div className="text-sm text-gray-500">
        <p>Published: {tender.publication_date}</p>
        {tender.deadline && <p>Deadline: {tender.deadline}</p>}
      </div>

      <a
        href={tender.raw_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-blue-600 hover:underline"
      >
        View Original Notice →
      </a>
    </main>
  )
}

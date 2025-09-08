import { supabase } from '@/lib/supabase'

export default async function TenderPage({ params }: { params: { id: string } }) {
  const { data: tender } = await supabase.from('tenders').select('*').eq('id', params.id).single()

  if (!tender) {
    return <main style={{maxWidth:800,margin:'40px auto'}}><p>Not found.</p></main>
  }

  return (
    <main style={{maxWidth:800,margin:'40px auto'}}>
      <h2>{tender.title}</h2>
      <p><b>Buyer:</b> {tender.buyer || '—'} • <b>Country:</b> {tender.country || '—'}</p>
      <p><b>Published:</b> {tender.publication_date || '—'} • <b>Deadline:</b> {tender.deadline || '—'}</p>
      <p><b>Budget:</b> {tender.budget ? `${tender.currency || ''} ${tender.budget}` : '—'}</p>
      <p><b>AI summary:</b> {tender.ai_summary || '—'}</p>
      {tender.raw_url && <p><a href={tender.raw_url} target="_blank">Open official notice</a></p>}
      {tender.pdf_url && <p><a href={tender.pdf_url} target="_blank">Download documents</a></p>}
    </main>
  )
}

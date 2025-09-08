import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default async function Search({ searchParams }: { searchParams: { q?: string, country?: string } }) {
  const q = (searchParams.q || '').trim()
  const country = (searchParams.country || '').trim()

  let query = supabase
    .from('tenders')
    .select('id,title,buyer,country,deadline,source')
    .order('deadline', { ascending: true })
    .limit(50)

  if (q) query = query.textSearch('tsv', `${q}:*`)
  if (country) query = query.eq('country', country)

  const { data } = await query

  return (
    <main style={{maxWidth:960,margin:'40px auto',padding:20}}>
      <h1>Tender Bot AI – Search</h1>
      <form>
        <input name="q" defaultValue={q} placeholder="Search (e.g. solar Kenya)" />
        <input name="country" defaultValue={country} placeholder="Country (optional)" />
        <button type="submit">Search</button>
      </form>
      <ul>
        {data?.map(t => (
          <li key={t.id} style={{margin:'12px 0'}}>
            <Link href={`/tender/${t.id}`}>{t.title}</Link>
            <div>{t.buyer || '—'} • {t.country || '—'} • deadline {t.deadline || '—'} • {t.source}</div>
          </li>
        ))}
      </ul>
    </main>
  )
}
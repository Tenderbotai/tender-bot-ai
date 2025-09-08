import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE! // server-only secret
)

type TenderRow = Record<string, unknown>

async function upsertTender(row: TenderRow) {
  row.updated_at = new Date().toISOString()
  await supabaseAdmin
    .from('tenders')
    .upsert(row, { onConflict: 'source,source_id' })
}

async function getCursor(source: string) {
  const { data } = await supabaseAdmin
    .from('ingest_cursors')
    .select('*')
    .eq('source', source)
    .single()
  return (data as { cursor?: string } | null)?.cursor || null
}

async function setCursor(source: string, cursor: string) {
  await supabaseAdmin.from('ingest_cursors').upsert({
    source,
    cursor,
    updated_at: new Date().toISOString()
  })
}

/* Optional AI summary */
async function summarize(text?: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  const content = (text || '').slice(0, 6000)
  if (!key || !content) return ''
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: `Summarize this procurement notice in 3 short sentences for potential bidders:\n\n${content}`
    })
  })
  const j = (await res.json()) as { output_text?: string }
  return j.output_text?.trim() || ''
}

/* ====== CONNECTORS ====== */

async function fetchWorldBank() {
  const url = 'https://search.worldbank.org/api/procnotices?format=json&rows=200'
  const r = await fetch(url)
  const j = (await r.json()) as { procnotices?: Record<string, TenderRow> }
  const items = Object.values(j.procnotices || {})
  for (const it of items) {
    const ai_summary = await summarize(
      String(it.description || it.project_name || '')
    )
    await upsertTender({
      source: 'world_bank',
      source_id: (it.id as string) ||
        (it.notice_no as string) ||
        `${it.project_id}-${it.notice_no}`,
      title: (it.title as string) || (it.project_name as string),
      description: (it.description as string) || '',
      buyer: it.procurement_method,
      country: it.country_name,
      publication_date: (it.posting_date as string)?.slice(0, 10),
      deadline: (it.deadline_date as string)?.slice(0, 10),
      raw_url: it.url,
      ai_summary
    })
  }
}

async function fetchUK_FTS() {
  const base =
    'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=50'
  const r = await fetch(base, { headers: { Accept: 'application/json' } })
  const j = (await r.json()) as { releases?: TenderRow[] }
  for (const rel of j.releases || []) {
    const parties = (rel.parties as TenderRow[] | undefined) || []
    const buyer =
      (rel.buyer as TenderRow)?.name ||
      parties.find(p => (p.roles as string[] | undefined)?.includes('buyer'))
        ?.name
    const buyerCountry = parties.find(p =>
      (p.roles as string[] | undefined)?.includes('buyer')
    )?.address?.countryName
    const ai_summary = await summarize(
      String(
        (rel.tender as TenderRow)?.description ||
          (rel.tender as TenderRow)?.title ||
          rel.title ||
          ''
      )
    )
    await upsertTender({
      source: 'fts_uk',
      source_id: rel.id,
      title: (rel.tender as TenderRow)?.title || rel.title,
      description: (rel.tender as TenderRow)?.description || '',
      buyer,
      country: buyerCountry,
      cpv: (rel.tender as TenderRow)?.items?.[0]?.classification?.id,
      publication_date: (rel.date as string)?.slice(0, 10),
      deadline: (rel.tender as TenderRow)?.tenderPeriod?.endDate?.slice(0, 10),
      ocds_release_id: rel.id,
      raw_url: 'https://www.find-tender.service.gov.uk/',
      ai_summary
    })
  }
}

/* ... repeat the same `unknown` / `Record<string, unknown>` adjustments for the other fetchers ... */

export async function GET() {
  await Promise.allSettled([
    fetchWorldBank(),
    fetchUK_FTS(),
    fetchUK_ContractsFinder(),
    fetchUSA_SAM(),
    fetchUA_Prozorro(),
    fetchCL_ChileCompra(),
    fetchPY_DNCP(),
    fetchCO_SECOP(),
    fetchBR_PNCP(),
    fetchFI_HILMA(),
    fetchPL_Ezamowienia(),
    fetchPT_BASE(),
    fetchCA_CanadaBuys(),
    fetchEU_TED()
  ])
  return NextResponse.json({ ok: true })
}


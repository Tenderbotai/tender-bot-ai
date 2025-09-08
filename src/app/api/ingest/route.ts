import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!        // server-only secret
)

async function upsertTender(row: any) {
  row.updated_at = new Date().toISOString()
  await supabaseAdmin.from('tenders').upsert(row, { onConflict: 'source,source_id' })
}

async function getCursor(source: string) {
  const { data } = await supabaseAdmin.from('ingest_cursors').select('*').eq('source', source).single()
  return data?.cursor || null
}
async function setCursor(source: string, cursor: string) {
  await supabaseAdmin.from('ingest_cursors').upsert({ source, cursor, updated_at: new Date().toISOString() })
}

/* Optional AI summary: only runs if OPENAI_API_KEY exists */
async function summarize(text?: string) {
  const key = process.env.OPENAI_API_KEY
  const content = (text || '').slice(0, 6000)
  if (!key || !content) return ''
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: `Summarize this procurement notice in 3 short sentences for potential bidders:\n\n${content}`
    })
  })
  const j = await res.json()
  return j.output_text?.trim() || ''
}

/* ====== CONNECTORS (add/remove as you like) ====== */

/* 1) World Bank (JSON) */
async function fetchWorldBank() {
  const url = 'https://search.worldbank.org/api/procnotices?format=json&rows=200'
  const r = await fetch(url)
  const j: any = await r.json()
  const items = Object.values<any>(j.procnotices || {})
  for (const it of items) {
    const ai_summary = await summarize(it.description || it.project_name)
    await upsertTender({
      source: 'world_bank',
      source_id: it.id || it.notice_no || `${it.project_id}-${it.notice_no}`,
      title: it.title || it.project_name,
      description: it.description || '',
      buyer: it.procurement_method,
      country: it.country_name,
      publication_date: it.posting_date?.slice(0,10),
      deadline: it.deadline_date?.slice(0,10),
      raw_url: it.url,
      ai_summary
    })
  }
}

/* 2) UK Find a Tender (OCDS) */
async function fetchUK_FTS() {
  const base = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=50'
  const r = await fetch(base, { headers: { 'Accept': 'application/json' } })
  const j: any = await r.json()
  for (const rel of (j.releases || [])) {
    const buyer = rel.buyer?.name || rel.parties?.find((p:any)=>p.roles?.includes('buyer'))?.name
    const buyerCountry = rel.parties?.find((p:any)=>p.roles?.includes('buyer'))?.address?.countryName
    const ai_summary = await summarize(rel.tender?.description || rel.tender?.title || rel.title)
    await upsertTender({
      source: 'fts_uk',
      source_id: rel.id,
      title: rel.tender?.title || rel.title,
      description: rel.tender?.description || '',
      buyer,
      country: buyerCountry,
      cpv: rel.tender?.items?.[0]?.classification?.id,
      publication_date: rel.date?.slice(0,10),
      deadline: rel.tender?.tenderPeriod?.endDate?.slice(0,10),
      ocds_release_id: rel.id,
      raw_url: 'https://www.find-tender.service.gov.uk/',
      ai_summary
    })
  }
}

/* 3) UK Contracts Finder (JSON; token may be required) */
async function fetchUK_ContractsFinder() {
  const token = process.env.CFINDER_TOKEN
  const r = await fetch('https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json', {
    method: 'POST',
    headers: {
      'content-type':'application/json',
      ...(token ? { 'authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ pageSize: 50, filters: { status:'Open', noticeType:'Opportunity' } })
  })
  const j:any = await r.json()
  for (const it of (j?.searchResults ?? [])) {
    const ai_summary = await summarize(it.description || it.title)
    await upsertTender({
      source: 'contracts_finder_uk',
      source_id: it.noticeId || it.id,
      title: it.title,
      description: it.description || '',
      buyer: it.organisationName,
      country: 'United Kingdom',
      publication_date: it.publishedDate?.slice(0,10),
      deadline: it.deadlineDate?.slice(0,10),
      raw_url: it.noticeIdentifierUrl || '',
      ai_summary
    })
  }
}

/* 4) USA SAM.gov (needs API key) */
async function fetchUSA_SAM() {
  const key = process.env.SAM_API_KEY
  if (!key) return
  const url = `https://api.sam.gov/opportunities/v2/search?api_key=${key}&ptype=o&limit=100`
  const r = await fetch(url)
  const j:any = await r.json()
  for (const it of (j?.opportunitiesData ?? [])) {
    const ai_summary = await summarize(it.description || it.title)
    await upsertTender({
      source: 'sam_usa',
      source_id: it.noticeId,
      title: it.title,
      description: it.description || '',
      buyer: it.department || it.agency || 'US Federal',
      country: 'United States',
      publication_date: it.postedDate?.slice(0,10),
      deadline: (it.responseDeadLine || it.responseDate || '').slice(0,10),
      raw_url: it.uiLink,
      ai_summary
    })
  }
}

/* 5) Ukraine Prozorro (OCDS; supports incremental offset) */
async function fetchUA_Prozorro() {
  const cursor = await getCursor('prozorro_ua')
  const url = cursor
    ? `https://public.api.openprocurement.org/api/2.5/tenders?limit=50&offset=${encodeURIComponent(cursor)}`
    : `https://public.api.openprocurement.org/api/2.5/tenders?limit=50`
  const r = await fetch(url)
  const j:any = await r.json()
  for (const it of (j?.data ?? [])) {
    const ai_summary = await summarize(it.description || it.title)
    await upsertTender({
      source: 'prozorro_ua',
      source_id: it.id,
      title: it.title || it.tenderID || 'Procurement notice',
      description: it.description || '',
      buyer: it.procuringEntity?.name,
      country: 'Ukraine',
      publication_date: (it.date || it.dateModified || '').slice(0,10),
      deadline: it.tenderPeriod?.endDate?.slice(0,10),
      raw_url: `https://prozorro.gov.ua/tender/${it.id}`,
      ai_summary
    })
  }
  if (j?.next_page?.offset) await setCursor('prozorro_ua', j.next_page.offset)
}

/* 6) ChileCompra (needs API key) */
async function fetchCL_ChileCompra() {
  const key = process.env.CHILECOMPRA_API_KEY
  if (!key) return
  const url = `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?ticket=${key}&estado=publicada`
  const r = await fetch(url)
  const j:any = await r.json()
  for (const it of (j?.Listado ?? [])) {
    const ai_summary = await summarize(it.Descripcion || it.Nombre)
    await upsertTender({
      source: 'chilecompra_cl',
      source_id: it.CodigoExterno,
      title: it.Nombre,
      description: it.Descripcion || '',
      buyer: it.NombreOrganismo,
      country: 'Chile',
      publication_date: it.FechaPublicacion?.slice(0,10),
      deadline: it.FechaCierre?.slice(0,10),
      raw_url: it.UrlPublica,
      ai_summary
    })
  }
}

/* 7) Paraguay DNCP (CKAN) */
async function fetchPY_DNCP() {
  const r = await fetch('https://www.contrataciones.gov.py/datos/api/3/action/package_search?q=convocatoria&rows=50')
  const j:any = await r.json()
  for (const pkg of (j?.result?.results ?? [])) {
    await upsertTender({
      source: 'dncp_py',
      source_id: pkg.id,
      title: pkg.title,
      description: pkg.notes || '',
      buyer: 'Multiple',
      country: 'Paraguay',
      publication_date: pkg.metadata_created?.slice(0,10),
      raw_url: pkg.url || 'https://www.contrataciones.gov.py/datos/'
    })
  }
}

/* 8) Colombia SECOP (open data example) */
async function fetchCO_SECOP() {
  const endpoints = [
    'https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=50'
  ]
  for (const ep of endpoints) {
    const r = await fetch(ep)
    if (!r.ok) continue
    const arr:any[] = await r.json()
    for (const it of arr) {
      await upsertTender({
        source: 'secop_co',
        source_id: it?.id || it?.proceso_de_compra || JSON.stringify(it).slice(0,64),
        title: it?.objeto || it?.titulo || 'Proceso de contratación',
        description: it?.descripcion || '',
        buyer: it?.entidad || it?.nombre_entidad,
        country: 'Colombia',
        publication_date: (it?.fecha_publicacion || it?.fecha_de_publicacion || '').slice(0,10),
        deadline: (it?.fecha_cierre || it?.fecha_de_cierre || '').slice(0,10),
        raw_url: 'https://www.colombiacompra.gov.co/transparencia/datos-abiertos'
      })
    }
  }
}

/* 9) Brazil PNCP (placeholder; explore Swagger for richer queries) */
async function fetchBR_PNCP() {
  const url = 'https://pncp.gov.br/api/consulta/v1/orgaos?pagina=0&tamanhoPagina=1'
  const r = await fetch(url)
  if (!r.ok) return
  await r.json() // map other PNCP endpoints for notices as you expand
}

/* 10) Finland HILMA (needs API key) */
async function fetchFI_HILMA() {
  const key = process.env.HILMA_API_KEY
  if (!key) return
  const url = 'https://hns-hilma-prod-apim.azure-api.net/avp/v1/contract-notices?limit=50'
  const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } })
  if (!r.ok) return
  const arr:any[] = await r.json()
  for (const it of arr) {
    await upsertTender({
      source: 'hilma_fi',
      source_id: String(it.id || it.noticeNumber || it.ocid || Math.random()),
      title: it.title || it.projectTitle || 'Notice',
      description: it.description || '',
      buyer: it.buyerName || it.organizationName,
      country: 'Finland',
      publication_date: (it.publicationDate || it.datePublished || '').slice(0,10),
      deadline: (it.deadlineDate || it.tenderPeriod?.endDate || '').slice(0,10),
      raw_url: 'https://www.hankintailmoitukset.fi/en'
    })
  }
}

/* 11) Poland e-Zamówienia (placeholder to wire concrete endpoint later) */
async function fetchPL_Ezamowienia() {
  // Add concrete endpoint(s) when you have them, then map like others and upsert.
}

/* 12) Portugal BASE (placeholder for OCDS data) */
async function fetchPT_BASE() {
  // Add concrete OCDS/data portal endpoint(s) here, then map and upsert.
}

/* 13) CanadaBuys (placeholder; wire dataset endpoint) */
async function fetchCA_CanadaBuys() {
  // Replace with a working JSON endpoint and map fields to upsert.
}

/* 14) EU TED (placeholder; use Developer API search) */
async function fetchEU_TED() {
  // Replace with TED API call(s), then map and upsert.
}

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

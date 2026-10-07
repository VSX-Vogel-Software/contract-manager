import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApolloClient, useQuery } from '@apollo/client'
import { AlertCircle, Loader2, Search, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MobileCard, MobileCardList } from '@/components/MobileCard'
import {
  GLOBAL_SEARCH,
  HighlightedText,
  SimilarHint,
  searchTypeIcon,
  type GlobalSearchData,
  type SearchGroup,
  type SearchItem,
} from '@/components/SearchResultParts'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { cn } from '@/lib/utils'

/** Treffer je Bereich und je Nachladen */
export const PAGE_SIZE = 25

/**
 * Ergebnisseite der globalen Suche (`/search?q=…&type=…`): alle Bereiche mit
 * je 25 Treffern, "Mehr laden" je Bereich, Filter-Chips je Bereich.
 */
export function SearchPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const query = (params.get('q') ?? '').trim()
  const type = params.get('type')
  const [draft, setDraft] = useState(query)

  useDocumentTitle(query ? `${t('search.resultsTitle')}: ${query}` : t('search.resultsTitle'))

  // Neue URL (Zurueck-Knopf, Schnellsuche) uebernimmt das Feld
  useEffect(() => {
    setDraft(query)
  }, [query])

  const updateParams = (next: { q?: string; type?: string | null }, replace = false) => {
    const p = new URLSearchParams(params)
    if (next.q !== undefined) p.set('q', next.q)
    if (next.type !== undefined) {
      if (next.type) p.set('type', next.type)
      else p.delete('type')
    }
    setParams(p, { replace })
  }

  // Beim Tippen nachziehen (ersetzt den Verlaufseintrag), Enter sofort
  useEffect(() => {
    const value = draft.trim()
    if (value === query || (value.length < 2 && value !== '')) return
    const timer = setTimeout(() => updateParams({ q: value }, true), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  return (
    <div className="mx-auto max-w-4xl space-y-4" data-testid="search-page">
      <h1 className="text-2xl font-bold">{t('search.resultsTitle')}</h1>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          updateParams({ q: draft.trim() })
        }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('common.search')}
            aria-label={t('search.resultsTitle')}
            data-testid="search-page-input"
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <Button type="submit" className="shrink-0">
          {t('search.submit')}
        </Button>
      </form>

      {query.length < 2 ? (
        <p className="py-8 text-center text-sm text-gray-500" data-testid="search-min-chars">
          {t('search.minChars')}
        </p>
      ) : (
        // key: neue Anfrage = frischer Zustand fuer nachgeladene Treffer
        <SearchResults
          key={query}
          query={query}
          type={type}
          onTypeChange={(next) => updateParams({ type: next }, true)}
        />
      )}
    </div>
  )
}

interface ExtraPage {
  items: SearchItem[]
  hasMore: boolean
  loading: boolean
  error: boolean
}

function SearchResults({
  query,
  type,
  onTypeChange,
}: {
  query: string
  type: string | null
  onTypeChange: (type: string | null) => void
}) {
  const { t } = useTranslation()
  const client = useApolloClient()
  const { data, loading, error, refetch } = useQuery<GlobalSearchData>(GLOBAL_SEARCH, {
    variables: { query, limit: PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  })
  // Nachgeladene Treffer je Bereich (zusaetzlich zu den ersten 25)
  const [extra, setExtra] = useState<Record<string, ExtraPage>>({})

  const groups: SearchGroup[] = data?.globalSearch?.groups ?? []

  const merged = groups.map((group) => {
    const more = extra[group.type]
    const seen = new Set(group.items.map((i) => i.id))
    const items = more ? [...group.items, ...more.items.filter((i) => !seen.has(i.id))] : group.items
    return {
      ...group,
      items,
      hasMore: more ? more.hasMore : group.hasMore,
      loadingMore: more?.loading ?? false,
      loadError: more?.error ?? false,
      // Naechster Abschnitt beim Backend: erste Seite plus alles bisher Nachgeladene
      nextOffset: group.items.length + (more?.items.length ?? 0),
    }
  })
  const visible = type ? merged.filter((g) => g.type === type) : merged

  const loadMore = async (groupType: string, offset: number) => {
    setExtra((prev) => ({
      ...prev,
      [groupType]: { items: prev[groupType]?.items ?? [], hasMore: true, loading: true, error: false },
    }))
    try {
      const result = await client.query<GlobalSearchData>({
        query: GLOBAL_SEARCH,
        variables: { query, limit: PAGE_SIZE, types: [groupType], offset },
        fetchPolicy: 'network-only',
      })
      const group = result.data?.globalSearch?.groups?.find((g) => g.type === groupType)
      setExtra((prev) => ({
        ...prev,
        [groupType]: {
          items: [...(prev[groupType]?.items ?? []), ...(group?.items ?? [])],
          hasMore: group?.hasMore ?? false,
          loading: false,
          error: false,
        },
      }))
    } catch {
      setExtra((prev) => ({
        ...prev,
        [groupType]: { items: prev[groupType]?.items ?? [], hasMore: true, loading: false, error: true },
      }))
    }
  }

  if (error && !data) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center"
        data-testid="search-error"
      >
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-red-700">{t('search.error')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t('search.retry')}
        </Button>
      </div>
    )
  }

  if (!data && loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center" data-testid="search-empty">
        <SearchX className="h-8 w-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-700">{t('search.noResultsFor', { query })}</p>
        <p className="text-sm text-gray-500">{t('search.noResultsHint')}</p>
      </div>
    )
  }

  const chipClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm',
      active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    )

  return (
    <div className={cn('space-y-6', loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
      {/* Filter-Chips je Bereich */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('search.filterLabel')}>
        <button
          type="button"
          className={chipClass(!type)}
          aria-pressed={!type}
          onClick={() => onTypeChange(null)}
          data-testid="search-filter-all"
        >
          {t('search.all')}
        </button>
        {merged.map((group) => {
          const Icon = searchTypeIcon(group.type)
          return (
            <button
              key={group.type}
              type="button"
              className={chipClass(type === group.type)}
              aria-pressed={type === group.type}
              onClick={() => onTypeChange(type === group.type ? null : group.type)}
              data-testid={`search-filter-${group.type}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`search.${group.type}`, group.label)}
              <span className="tabular-nums opacity-70">
                {group.items.length}
                {group.hasMore ? '+' : ''}
              </span>
            </button>
          )
        })}
      </div>

      {visible.map((group) => {
        const Icon = searchTypeIcon(group.type)
        return (
          <section key={group.type} className="space-y-2" data-testid={`search-group-${group.type}`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              <Icon className="h-4 w-4" />
              {t(`search.${group.type}`, group.label)}
            </h2>

            {/* Telefon: Karten */}
            <MobileCardList>
              {group.items.map((item) => (
                <MobileCard
                  key={item.id}
                  to={item.url}
                  data-testid={`search-card-${group.type}-${item.id}`}
                  className={cn(item.fuzzy && 'border-dashed')}
                  leading={<Icon className="h-4 w-4 text-gray-400" />}
                  title={
                    <span className={cn(item.fuzzy && 'font-normal text-gray-600')}>
                      <HighlightedText text={item.title} query={query} plain={item.fuzzy} />
                    </span>
                  }
                  badge={item.fuzzy ? <SimilarHint /> : undefined}
                  subtitle={
                    item.subtitle ? (
                      <HighlightedText text={item.subtitle} query={query} plain={item.fuzzy} />
                    ) : undefined
                  }
                />
              ))}
            </MobileCardList>

            {/* Ab md: Liste */}
            <ul className="hidden divide-y rounded-lg border bg-white md:block">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.url}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50"
                    data-testid={`search-row-${group.type}-${item.id}`}
                    data-fuzzy={item.fuzzy ? 'true' : undefined}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'min-w-0 break-words text-sm',
                            item.fuzzy ? 'text-gray-600' : 'font-medium text-gray-900'
                          )}
                        >
                          <HighlightedText text={item.title} query={query} plain={item.fuzzy} />
                        </span>
                        {item.fuzzy && <SimilarHint />}
                      </div>
                      {item.subtitle && (
                        <div className="break-words text-xs text-gray-500">
                          <HighlightedText text={item.subtitle} query={query} plain={item.fuzzy} />
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {group.loadError && (
              <p className="text-sm text-red-600" data-testid={`search-load-more-error-${group.type}`}>
                {t('search.error')}
              </p>
            )}
            {group.hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={group.loadingMore}
                onClick={() => loadMore(group.type, group.nextOffset)}
                data-testid={`search-load-more-${group.type}`}
              >
                {group.loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('search.loadMore')}
              </Button>
            )}
          </section>
        )
      })}
    </div>
  )
}

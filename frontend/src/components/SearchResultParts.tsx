import { gql } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import {
  User,
  FileText,
  Receipt,
  FileSignature,
  Inbox,
  Landmark,
  Package,
  type LucideIcon,
} from 'lucide-react'
import { highlightSegments } from '@/lib/searchFold'
import { cn } from '@/lib/utils'

/** Gemeinsame Teile von Schnellsuche (GlobalSearch) und Ergebnisseite (/search). */

export const GLOBAL_SEARCH = gql`
  query GlobalSearch($query: String!, $limit: Int, $types: [String!], $offset: Int) {
    globalSearch(query: $query, limit: $limit, types: $types, offset: $offset) {
      totalCount
      groups {
        type
        label
        hasMore
        items {
          id
          title
          subtitle
          url
          fuzzy
        }
      }
    }
  }
`

export interface SearchItem {
  id: string
  title: string
  subtitle?: string | null
  url: string
  /** Aehnlicher (unscharfer) Treffer - nicht hervorheben. */
  fuzzy: boolean
}

export interface SearchGroup {
  type: string
  label: string
  hasMore: boolean
  items: SearchItem[]
}

export interface GlobalSearchData {
  globalSearch: { totalCount: number; groups: SearchGroup[] }
}

/** Alle Bereiche in der festen Reihenfolge des Backends (bei gleichem Rang). */
export const SEARCH_TYPES = [
  'customer',
  'contract',
  'invoice',
  'offer',
  'incoming_invoice',
  'counterparty',
  'product',
] as const

const TYPE_ICONS: Record<string, LucideIcon> = {
  customer: User,
  contract: FileText,
  invoice: Receipt,
  offer: FileSignature,
  incoming_invoice: Inbox,
  counterparty: Landmark,
  product: Package,
}

export function searchTypeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? FileText
}

/** Link zur Ergebnisseite, optional auf einen Bereich gefiltert. */
export function searchResultsUrl(query: string, type?: string): string {
  const params = new URLSearchParams({ q: query.trim() })
  if (type) params.set('type', type)
  return `/search?${params.toString()}`
}

/** Text mit fett markierten Fundstellen; bei `plain` (ähnliche Treffer) unverändert. */
export function HighlightedText({ text, query, plain = false }: { text: string; query: string; plain?: boolean }) {
  if (plain) return <>{text}</>
  return (
    <>
      {highlightSegments(text, query).map((segment, i) =>
        segment.match ? (
          <mark key={i} className="bg-transparent font-bold text-gray-900" data-testid="search-highlight">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  )
}

/** Kleiner Hinweis "ähnlich" für unscharfe Treffer. */
export function SimilarHint({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn('shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal leading-none text-gray-500', className)}
      data-testid="search-similar-hint"
    >
      {t('search.similar')}
    </span>
  )
}

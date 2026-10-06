import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SortOption<F extends string> {
  value: F
  label: string
}

interface MobileSortControlProps<F extends string> {
  options: SortOption<F>[]
  sortBy: F
  sortOrder: 'asc' | 'desc'
  onSortByChange: (field: F) => void
  onSortOrderChange: (order: 'asc' | 'desc') => void
  className?: string
}

/**
 * Sortierung fuer Kartenlisten. Auf dem Desktop sortiert man ueber die
 * Tabellenkoepfe; die Karten unterhalb von `md` haben keine, deshalb hier
 * ein natives Auswahlfeld (oeffnet den Geraete-Picker) plus Richtungsknopf.
 */
export function MobileSortControl<F extends string>({
  options,
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
  className,
}: MobileSortControlProps<F>) {
  const { t } = useTranslation()
  const ascending = sortOrder === 'asc'
  return (
    <div className={cn('flex items-center gap-2 md:hidden', className)} data-testid="mobile-sort">
      <label className="shrink-0 text-sm text-gray-500" htmlFor="mobile-sort-field">
        {t('mobile.sortBy')}
      </label>
      <select
        id="mobile-sort-field"
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value as F)}
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-white px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onSortOrderChange(ascending ? 'desc' : 'asc')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-white text-gray-600"
        aria-label={ascending ? t('mobile.sortAscending') : t('mobile.sortDescending')}
        data-testid="mobile-sort-order"
      >
        {ascending ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </button>
    </div>
  )
}

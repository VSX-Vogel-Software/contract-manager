import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useAuditLogs, AuditLogTable } from '@/features/audit'

export function ActivityTab({ contractId }: { contractId: number }) {
  const { t } = useTranslation()
  const { entries, totalCount, hasNextPage, loading, error, loadMore } = useAuditLogs({
    entityType: 'contract',
    entityId: contractId,
    includeRelated: true,
  })

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-600">{error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <AuditLogTable entries={entries} showEntity={true} loading={loading && entries.length === 0} />

      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('audit.loadMore')}
          </button>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-500">
          {t('audit.showing', { count: entries.length, total: totalCount })}
        </div>
      )}
    </div>
  )
}

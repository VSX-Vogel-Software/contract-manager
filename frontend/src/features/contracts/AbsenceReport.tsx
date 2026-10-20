import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery, useLazyQuery, useMutation, gql } from '@apollo/client'
import { pushToast } from '@/lib/toastStore'
import { Loader2, FileText, Send, RefreshCw, Lock, Info, UserCheck, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const ABSENCE_REPORT_QUERY = gql`
  query AbsenceReport($year: Int!, $month: Int!) {
    absenceReport(year: $year, month: $month) {
      id
      year
      month
      status
      finalizedAt
      entries {
        id
        userName
        externalUserId
        absenceType
        dateFrom
        dateTo
        daysCount
      }
    }
  }
`

const GENERATE_ABSENCE_REPORT = gql`
  mutation GenerateAbsenceReport($year: Int!, $month: Int!) {
    generateAbsenceReport(year: $year, month: $month) {
      id
      year
      month
      status
      entries {
        id
        userName
        externalUserId
        absenceType
        dateFrom
        dateTo
        daysCount
      }
    }
  }
`

const FINALIZE_ABSENCE_REPORT = gql`
  mutation FinalizeAbsenceReport($reportId: ID!) {
    finalizeAbsenceReport(reportId: $reportId) {
      id
      status
      finalizedAt
    }
  }
`

// Nur Benutzer, die Abwesenheiten sehen duerfen (department_analysis.read)
const ABSENCE_REPORT_RECIPIENTS_QUERY = gql`
  query AbsenceReportRecipients {
    absenceReportRecipients {
      id
      name
      email
    }
  }
`

const SEND_ABSENCE_REPORT_TO_USER = gql`
  mutation SendAbsenceReportToUser($reportId: ID!, $userId: ID!) {
    sendAbsenceReportToUser(reportId: $reportId, userId: $userId) {
      success
      error
    }
  }
`

interface RecipientUser {
  id: string
  name: string
  email: string
}

const REPORT_SCHEDULES_QUERY = gql`
  query ReportSchedulesAbsence {
    reportSchedules {
      reportType
      enabled
      autoFinalize
    }
  }
`

const ABSENCE_TYPE_LABELS: Record<string, Record<string, string>> = {
  de: {
    sick_certificate: 'Krank mit AU',
    sick: 'Krank ohne AU',
    sick_child_certificate: 'Kind krank mit AU',
    sick_child: 'Kind krank ohne AU',
    vacation: 'Urlaub',
    special_leave: 'Sonderurlaub',
    education: 'Fortbildung',
    overtime_reduction: 'Überstundenabbau',
    other: 'Sonstige',
  },
  en: {
    sick_certificate: 'Sick, with certificate',
    sick: 'Sick, no certificate',
    sick_child_certificate: 'Sick child, with certificate',
    sick_child: 'Sick child, no certificate',
    vacation: 'Vacation',
    special_leave: 'Special leave',
    education: 'Education',
    overtime_reduction: 'Overtime reduction',
    other: 'Other',
  },
}

// Reihenfolge der Summen nach Art (wie im PDF): Krankheit mit AU vor ohne AU
const ABSENCE_TYPE_ORDER = Object.keys(ABSENCE_TYPE_LABELS.de)

// In den Summen zaehlt Kind krank zu Krank mit bzw. ohne AU; die Einzelzeilen behalten ihre Art
const SUMMARY_TYPE: Record<string, string> = {
  sick_child: 'sick',
  sick_child_certificate: 'sick_certificate',
}

// Krankheit erscheint immer paarweise mit und ohne AU, auch wenn eine Seite 0 ist
const SICK_NOTE_PAIR = ['sick_certificate', 'sick']

function sumDaysByType(entries: AbsenceEntry[]): { absenceType: string; days: number }[] {
  const sums: Record<string, number> = {}
  for (const e of entries) {
    const type = SUMMARY_TYPE[e.absenceType] || e.absenceType
    sums[type] = (sums[type] || 0) + parseFloat(e.daysCount)
  }
  if (SICK_NOTE_PAIR.some((t) => t in sums)) {
    for (const t of SICK_NOTE_PAIR) sums[t] = sums[t] || 0
  }
  const rank = (t: string) => {
    const i = ABSENCE_TYPE_ORDER.indexOf(t)
    return i === -1 ? ABSENCE_TYPE_ORDER.length : i
  }
  return Object.entries(sums)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([absenceType, days]) => ({ absenceType, days }))
}

interface AbsenceEntry {
  id: number
  userName: string
  absenceType: string
  dateFrom: string
  dateTo: string
  daysCount: string
}

interface AbsenceReportData {
  id: number
  year: number
  month: number
  status: string
  finalizedAt: string | null
  entries: AbsenceEntry[]
}

function formatDateLocal(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function AbsenceReport() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'de'

  // Default to previous month
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [year, setYear] = useState(prevMonth.getFullYear())
  const [month, setMonth] = useState(prevMonth.getMonth() + 1)

  const [showSendToUserDialog, setShowSendToUserDialog] = useState(false)
  const [recipientUserId, setRecipientUserId] = useState('')

  const { data: schedulesData } = useQuery(REPORT_SCHEDULES_QUERY)
  const absenceSchedule = schedulesData?.reportSchedules?.find(
    (s: { reportType: string }) => s.reportType === 'absence'
  )
  const isAutoReportActive = absenceSchedule?.enabled === true
  const isAutoFinalize = absenceSchedule?.autoFinalize === true

  const { data, loading, refetch } = useQuery(ABSENCE_REPORT_QUERY, {
    variables: { year, month },
  })

  const [generateReport, { loading: generating }] = useMutation(GENERATE_ABSENCE_REPORT, {
    onCompleted: () => refetch(),
  })

  const [finalizeReport, { loading: finalizing }] = useMutation(FINALIZE_ABSENCE_REPORT, {
    onCompleted: () => refetch(),
  })

  const [loadRecipients, { data: recipientsData, loading: recipientsLoading }] = useLazyQuery(
    ABSENCE_REPORT_RECIPIENTS_QUERY,
    { fetchPolicy: 'network-only' },
  )
  const recipientUsers: RecipientUser[] = recipientsData?.absenceReportRecipients || []

  const [sendReportToUser, { loading: sendingToUser }] = useMutation(SEND_ABSENCE_REPORT_TO_USER, {
    onCompleted: (data) => {
      const result = data?.sendAbsenceReportToUser
      if (result?.success) {
        setShowSendToUserDialog(false)
        pushToast({ title: t('absenceReport.sent'), variant: 'success' })
      } else {
        pushToast({
          title: t('absenceReport.error'),
          description: result?.error || t('absenceReport.sendFailed'),
          variant: 'error',
        })
      }
    },
    onError: (err) => {
      pushToast({ title: t('absenceReport.error'), description: err.message, variant: 'error' })
    },
  })

  const openSendToUserDialog = () => {
    setRecipientUserId('')
    loadRecipients()
    setShowSendToUserDialog(true)
  }

  const report: AbsenceReportData | null = data?.absenceReport || null
  const isFinalized = report?.status === 'finalized'
  const isDraft = report?.status === 'draft'

  // Group entries by user
  const grouped = useMemo(() => {
    if (!report?.entries?.length) return []
    const map: Record<string, AbsenceEntry[]> = {}
    for (const entry of report.entries) {
      if (!map[entry.userName]) map[entry.userName] = []
      map[entry.userName].push(entry)
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([userName, entries]) => ({
        userName,
        entries: entries.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom)),
        totalDays: entries.reduce((sum, e) => sum + parseFloat(e.daysCount), 0),
        daysByType: sumDaysByType(entries),
      }))
  }, [report])

  const totalDays = grouped.reduce((sum, g) => sum + g.totalDays, 0)
  const totalDaysByType = useMemo(() => sumDaysByType(report?.entries || []), [report])

  // Month selector options (compact short format matching DepartmentAnalysis)
  const monthOptions = useMemo(() => {
    const options: { year: number; month: number; label: string }[] = []
    const cur = new Date()
    const currentYear = cur.getFullYear()
    for (let i = 0; i < 12; i++) {
      const d = new Date(currentYear, cur.getMonth() - i, 1)
      const shortMonth = d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { month: 'short' })
      const label = d.getFullYear() !== currentYear
        ? `${shortMonth} ${String(d.getFullYear()).slice(-2)}`
        : shortMonth
      options.push({ year: d.getFullYear(), month: d.getMonth() + 1, label })
    }
    return options
  }, [lang])

  const typeLabels = ABSENCE_TYPE_LABELS[lang] || ABSENCE_TYPE_LABELS.de

  return (
    <div>
      {/* Auto-report banner */}
      {isAutoReportActive && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Info className="h-4 w-4 shrink-0" />
          <span>{t('settings.reports.autoReportActive')}</span>
          <Link to="/settings/general/reports" className="ml-1 underline">{t('settings.reports.openSettings')}</Link>
        </div>
      )}

      {/* Month selector */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {monthOptions.slice(0, 6).map((opt) => (
          <button
            key={`${opt.year}-${opt.month}`}
            onClick={() => { setYear(opt.year); setMonth(opt.month) }}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              year === opt.year && month === opt.month
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateReport({ variables: { year, month } })}
          disabled={generating}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {report ? t('absenceReport.regenerate') : t('absenceReport.generate')}
        </Button>

        {isDraft && report && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => finalizeReport({ variables: { reportId: String(report.id) } })}
            disabled={finalizing || isAutoFinalize}
            title={isAutoFinalize ? t('settings.reports.autoFinalizedHint') : undefined}
          >
            <Lock className="mr-2 h-4 w-4" />
            {t('absenceReport.finalize')}
          </Button>
        )}

        {isFinalized && report && (
          <Button
            variant="outline"
            size="sm"
            onClick={openSendToUserDialog}
            data-testid="absence-send-to-user-button"
          >
            <UserCheck className="mr-2 h-4 w-4" />
            {t('absenceReport.sendToUser')}
          </Button>
        )}

        {report && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isFinalized
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {isFinalized ? t('absenceReport.statusFinalized') : t('absenceReport.statusDraft')}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {!loading && !report && (
        <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          <FileText className="mx-auto h-8 w-8 mb-2" />
          <p>{t('absenceReport.noReport')}</p>
          <p className="text-sm mt-1">{t('absenceReport.clickGenerate')}</p>
        </div>
      )}

      {!loading && report && grouped.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          <p>{t('absenceReport.noEntries')}</p>
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.userName} className="rounded-lg border">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-t-lg">
                <span className="font-medium">{group.userName}</span>
                <span className="text-sm text-gray-500">
                  {group.totalDays.toFixed(1)} {t('absenceReport.days')}
                </span>
              </div>
              {group.daysByType.length > 1 && (
                <div className="border-b px-4 py-1.5 text-xs text-gray-500" data-testid="absence-employee-days-by-type">
                  {group.daysByType
                    .map((row) => `${typeLabels[row.absenceType] || row.absenceType}: ${row.days.toFixed(1)}`)
                    .join(' · ')}
                </div>
              )}
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500 uppercase">
                    <th className="w-1/4 px-4 py-2">{t('absenceReport.type')}</th>
                    <th className="w-1/4 px-4 py-2">{t('absenceReport.from')}</th>
                    <th className="w-1/4 px-4 py-2">{t('absenceReport.to')}</th>
                    <th className="w-1/4 px-4 py-2 text-right">{t('absenceReport.days')}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-sm">{typeLabels[entry.absenceType] || entry.absenceType}</td>
                      <td className="px-4 py-2 text-sm">{formatDateLocal(entry.dateFrom)}</td>
                      <td className="px-4 py-2 text-sm">{formatDateLocal(entry.dateTo)}</td>
                      <td className="px-4 py-2 text-sm text-right">{parseFloat(entry.daysCount).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className="rounded-lg border" data-testid="absence-days-by-type">
            <div className="bg-gray-50 px-4 py-2 rounded-t-lg font-medium">{t('absenceReport.daysByType')}</div>
            <table className="w-full">
              <tbody>
                {totalDaysByType.map((row) => (
                  <tr key={row.absenceType} className="border-b last:border-0">
                    <td className="px-4 py-2 text-sm">{typeLabels[row.absenceType] || row.absenceType}</td>
                    <td className="px-4 py-2 text-sm text-right">{row.days.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 font-medium">
            <span>{t('absenceReport.totalDays')}</span>
            <span>{totalDays.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* Send to user dialog */}
      <Dialog open={showSendToUserDialog} onOpenChange={setShowSendToUserDialog}>
        <DialogContent data-testid="absence-send-to-user-dialog">
          <DialogHeader>
            <DialogTitle>{t('absenceReport.sendToUserTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="absence-recipient-user">
                {t('absenceReport.recipientUser')}
              </label>
              {recipientsLoading ? (
                <div className="flex items-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : recipientUsers.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">{t('absenceReport.noRecipientUsers')}</p>
              ) : (
                <div className="relative mt-1">
                  <select
                    id="absence-recipient-user"
                    data-testid="absence-recipient-user-select"
                    value={recipientUserId}
                    onChange={(e) => setRecipientUserId(e.target.value)}
                    className="w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">{t('absenceReport.recipientUserPlaceholder')}</option>
                    {recipientUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name === u.email ? u.email : `${u.name} (${u.email})`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">{t('absenceReport.recipientUserHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendToUserDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              data-testid="absence-send-to-user-submit"
              onClick={() => {
                if (recipientUserId && report) {
                  sendReportToUser({ variables: { reportId: String(report.id), userId: recipientUserId } })
                }
              }}
              disabled={sendingToUser || !recipientUserId}
            >
              {sendingToUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t('absenceReport.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, gql } from '@apollo/client'
import {
  Loader2,
  TrendingUp,
  Upload,
  FileSignature,
} from 'lucide-react'
import { formatDate, formatCurrency, formatPercent } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { CREATE_OFFER_MUTATION } from './contractOfferMutations'

const BILLING_SCHEDULE_QUERY = gql`
  query BillingSchedule($contractId: ID!, $months: Int, $includeAllHistory: Boolean) {
    billingSchedule(contractId: $contractId, months: $months, includeHistory: $includeAllHistory) {
      events {
        date
        items {
          itemId
          productName
          description
          quantity
          unitPrice
          amount
          isProrated
          prorateFactor
        }
        total
        matchedInvoice {
          id
          invoiceNumber
          isPaid
          pdfUrl
        }
      }
      totalForecast
      periodStart
      periodEnd
      error
    }
  }
`

const OFFERS_FOR_CONTRACT_QUERY = gql`
  query OffersForContract($contractId: Int!) {
    offersForContract(contractId: $contractId) {
      id
      offerNumber
      billingDate
      status
    }
  }
`

const UPLOAD_FORECAST_INVOICE_MUTATION = gql`
  mutation UploadForecastInvoice($input: UploadForecastInvoiceInput!) {
    uploadForecastInvoice(input: $input) {
      success
      error
      invoice {
        id
        invoiceNumber
        invoiceDate
        totalAmount
        extractionStatus
      }
    }
  }
`

const CONFIRM_FORECAST_INVOICE_MUTATION = gql`
  mutation ConfirmForecastInvoice($input: ConfirmForecastInvoiceInput!) {
    confirmForecastInvoice(input: $input) {
      success
      error
    }
  }
`

const DELETE_INVOICE_MUTATION = gql`
  mutation DeleteInvoice($id: ID!) {
    deleteInvoice(id: $id) {
      success
      error
    }
  }
`

interface BillingScheduleItem {
  itemId: number
  productName: string
  description: string
  quantity: number
  unitPrice: string
  amount: string
  isProrated: boolean
  prorateFactor: string | null
}

interface MatchedInvoice {
  id: string
  invoiceNumber: string
  isPaid: boolean
  pdfUrl: string | null
}

interface BillingEvent {
  date: string
  items: BillingScheduleItem[]
  total: string
  matchedInvoice: MatchedInvoice | null
}

interface BillingScheduleResult {
  events: BillingEvent[]
  totalForecast: string
  periodStart: string
  periodEnd: string
  error: string | null
}

export function ForecastTab({ contractId }: { contractId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canCreateOffers = hasPermission('offers', 'write')
  const [months, setMonths] = useState('13')
  const [includeAllHistory, setIncludeAllHistory] = useState(false)
  const [creatingForDate, setCreatingForDate] = useState<string | null>(null)

  // Invoice upload state
  const [uploadingForDate, setUploadingForDate] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    invoiceId: string
    invoiceNumber: string
    invoiceDate: string
    totalAmount: string
    extractionFailed: boolean
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadDateRef = useRef<string | null>(null)

  const { data, loading, error, refetch } = useQuery(BILLING_SCHEDULE_QUERY, {
    variables: {
      contractId,
      months: parseInt(months),
      includeAllHistory,
    },
  })

  const { data: offersData } = useQuery(OFFERS_FOR_CONTRACT_QUERY, {
    variables: { contractId: parseInt(contractId) },
    skip: !canCreateOffers,
  })

  const [createOffer] = useMutation(CREATE_OFFER_MUTATION)
  const [uploadForecastInvoice] = useMutation(UPLOAD_FORECAST_INVOICE_MUTATION)
  const [confirmForecastInvoice] = useMutation(CONFIRM_FORECAST_INVOICE_MUTATION, { context: { suppressErrorToast: true } })
  const [deleteInvoice] = useMutation(DELETE_INVOICE_MUTATION)

  const handleInvoiceUpload = (billingDate: string) => {
    uploadDateRef.current = billingDate
    setUploadingForDate(billingDate)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setUploadingForDate(null)
      return
    }

    // Read file as base64
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      try {
        const result = await uploadForecastInvoice({
          variables: {
            input: {
              fileContent: base64,
              filename: file.name,
              contractId: parseInt(contractId),
              billingDate: uploadDateRef.current,
            },
          },
        })

        const data = result.data?.uploadForecastInvoice
        if (data?.success && data.invoice) {
          const inv = data.invoice
          setConfirmDialog({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber || '',
            invoiceDate: inv.invoiceDate || '',
            totalAmount: inv.totalAmount || '',
            extractionFailed: inv.extractionStatus === 'extraction_failed',
          })
        } else {
          alert(data?.error || t('common.error'))
        }
      } catch (err) {
        alert(t('common.error'))
      } finally {
        setUploadingForDate(null)
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  const handleConfirmInvoice = async () => {
    if (!confirmDialog) return
    try {
      const result = await confirmForecastInvoice({
        variables: {
          input: {
            invoiceId: confirmDialog.invoiceId,
            invoiceNumber: confirmDialog.invoiceNumber,
            invoiceDate: confirmDialog.invoiceDate,
            totalAmount: confirmDialog.totalAmount,
          },
        },
      })
      if (result.data?.confirmForecastInvoice?.success) {
        setConfirmDialog(null)
        refetch()
      } else {
        alert(result.data?.confirmForecastInvoice?.error || t('common.error'))
      }
    } catch {
      alert(t('common.error'))
    }
  }

  const handleCancelInvoice = async () => {
    if (!confirmDialog) return
    try {
      await deleteInvoice({ variables: { id: confirmDialog.invoiceId } })
    } catch {
      // Ignore delete errors
    }
    setConfirmDialog(null)
  }

  // Build a map of billingDate -> offer for quick lookup
  const offersByDate = useMemo(() => {
    const map = new Map<string, { id: number; offerNumber: string; status: string }>()
    if (offersData?.offersForContract) {
      for (const offer of offersData.offersForContract) {
        map.set(offer.billingDate, { id: offer.id, offerNumber: offer.offerNumber, status: offer.status })
      }
    }
    return map
  }, [offersData])

  const handleCreateOffer = async (billingDate: string) => {
    setCreatingForDate(billingDate)
    try {
      const result = await createOffer({
        variables: { contractId: parseInt(contractId), billingDate },
        refetchQueries: [{ query: OFFERS_FOR_CONTRACT_QUERY, variables: { contractId: parseInt(contractId) } }],
      })
      if (result.data?.createOffer?.success) {
        navigate(`/offers/${result.data.createOffer.offer.id}`)
      }
    } finally {
      setCreatingForDate(null)
    }
  }

  const schedule = data?.billingSchedule as BillingScheduleResult | undefined

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || schedule?.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-600">{error?.message || schedule?.error}</p>
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t('contracts.forecast.months')}:</label>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6</SelectItem>
              <SelectItem value="12">12</SelectItem>
              <SelectItem value="13">13</SelectItem>
              <SelectItem value="24">24</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="includeAllHistory"
            checked={includeAllHistory}
            onChange={(e) => setIncludeAllHistory(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="includeAllHistory" className="text-sm">
            {t('contracts.forecast.includeAllHistory')}
          </label>
        </div>
      </div>

      {/* Results */}
      {!schedule?.events || schedule.events.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center">
          <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-600">{t('contracts.forecast.noEvents')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Billing Events Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="table-sticky-first min-w-[560px] md:min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('contracts.forecast.billingDate')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('contracts.forecast.items')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('contracts.forecast.amount')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('contracts.forecast.invoice')}
                  </th>
                  {canCreateOffers && (
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                    {t('offers.title')}
                  </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {schedule.events.map((event, eventIndex) => {
                  const eventDate = new Date(event.date)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const isFuture = eventDate >= today

                  return (
                  <tr key={eventIndex} className={isFuture ? 'bg-green-50' : 'bg-white'}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {formatDate(event.date)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {event.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="text-sm">
                            <span className="text-gray-900">
                              {item.productName || item.description || '-'} × {item.quantity}
                            </span>
                            {item.isProrated && item.prorateFactor && (
                              <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">
                                {t('contracts.forecast.prorated')} ({formatPercent(item.prorateFactor)})
                              </span>
                            )}
                            <span className="ml-2 text-gray-500">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(event.total)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {event.matchedInvoice ? (
                        <div className="flex items-center gap-2">
                          {event.matchedInvoice.pdfUrl ? (
                            <a
                              href={event.matchedInvoice.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {event.matchedInvoice.invoiceNumber}
                            </a>
                          ) : (
                            <span className="text-gray-900">
                              {event.matchedInvoice.invoiceNumber}
                            </span>
                          )}
                          {event.matchedInvoice.isPaid ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              {t('invoices.paid')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              {t('invoices.unpaid')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleInvoiceUpload(event.date)}
                          disabled={uploadingForDate !== null}
                          className="inline-flex items-center gap-1 rounded p-1 touch:p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                          title={t('contracts.forecast.importInvoice')}
                        >
                          {uploadingForDate === event.date ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </td>
                    {canCreateOffers && (
                    <td className="whitespace-nowrap px-6 py-4 text-center text-sm">
                      {(() => {
                        const existingOffer = offersByDate.get(event.date)
                        if (existingOffer) {
                          return (
                            <Link
                              to={`/offers/${existingOffer.id}`}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                              title={t('offers.forecast.viewOffer')}
                            >
                              <FileSignature className="h-4 w-4" />
                              <span className="text-xs">{existingOffer.offerNumber}</span>
                            </Link>
                          )
                        }
                        return (
                          <button
                            onClick={() => handleCreateOffer(event.date)}
                            disabled={creatingForDate !== null}
                            className="inline-flex items-center gap-1 rounded p-1 touch:p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                            title={t('offers.forecast.createOffer')}
                          >
                            {creatingForDate === event.date ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileSignature className="h-4 w-4" />
                            )}
                          </button>
                        )
                      })()}
                    </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                    {t('contracts.forecast.totalForecast')}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-bold text-gray-900">
                    {formatCurrency(schedule.totalForecast)}
                  </td>
                  <td colSpan={canCreateOffers ? 2 : 1}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Period Info */}
          <p className="text-xs text-gray-500">
            {formatDate(schedule.periodStart)} – {formatDate(schedule.periodEnd)}
          </p>
        </div>
      )}

      {/* Hidden file input for invoice PDF upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Invoice confirmation dialog */}
      <Dialog open={confirmDialog !== null} onOpenChange={(open) => { if (!open) handleCancelInvoice() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contracts.forecast.confirmInvoice')}</DialogTitle>
            <DialogDescription>
              {confirmDialog?.extractionFailed
                ? t('contracts.forecast.extractionFailed')
                : t('contracts.forecast.confirmInvoiceDescription')}
            </DialogDescription>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-4 py-2">
              <div>
                <Label>{t('contracts.forecast.invoiceNumber')}</Label>
                <Input
                  value={confirmDialog.invoiceNumber}
                  onChange={(e) => setConfirmDialog({ ...confirmDialog, invoiceNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('contracts.forecast.invoiceDate')}</Label>
                <Input
                  type="date"
                  value={confirmDialog.invoiceDate}
                  onChange={(e) => setConfirmDialog({ ...confirmDialog, invoiceDate: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('contracts.forecast.invoiceAmount')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={confirmDialog.totalAmount}
                  onChange={(e) => setConfirmDialog({ ...confirmDialog, totalAmount: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelInvoice}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirmInvoice}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

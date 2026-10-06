import { useTranslation } from 'react-i18next'
import { Download, ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsTouch } from '@/lib/useMediaQuery'

interface PdfPreviewProps {
  /** URL oder Blob-URL des PDFs */
  src: string
  title: string
  /** Klassen fuer das iframe auf dem Desktop (Hoehe, Rahmen) */
  className?: string
  /** Dateiname fuer den Download-Hinweis, optional */
  fileName?: string
}

/**
 * PDF-Vorschau. Auf dem Desktop eingebettet wie bisher. Auf Touch-Geraeten
 * zeigt Chrome fuer Android ein eingebettetes PDF gar nicht an und iOS nur die
 * erste Seite - dort gibt es stattdessen einen Knopf, der das PDF im
 * Geraete-Viewer oeffnet.
 */
export function PdfPreview({ src, title, className, fileName }: PdfPreviewProps) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()

  if (!isTouch) {
    return <iframe src={src} className={cn('w-full rounded border', className)} title={title} />
  }

  return (
    <div
      className="flex flex-col items-center gap-3 rounded border bg-gray-50 px-4 py-8 text-center"
      data-testid="pdf-preview-touch"
    >
      <FileText className="h-10 w-10 text-gray-400" />
      <p className="text-sm text-gray-600">{fileName ?? title}</p>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        <ExternalLink className="h-4 w-4" />
        {t('mobile.openPdf')}
      </a>
      {/* Chrome fuer Android zeigt Blob-URLs in einem neuen Tab nicht immer an -
          der Download ist der verlaessliche Rueckweg */}
      <a
        href={src}
        download={fileName ?? `${title}.pdf`}
        className="inline-flex h-11 items-center gap-2 px-4 text-sm font-medium text-blue-600"
      >
        <Download className="h-4 w-4" />
        {t('mobile.downloadPdf')}
      </a>
      <p className="text-xs text-gray-400">{t('mobile.pdfHint')}</p>
    </div>
  )
}

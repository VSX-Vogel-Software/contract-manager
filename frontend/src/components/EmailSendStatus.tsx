import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface EmailSendStatusProps {
  /** Grund des letzten Fehlschlags; leer bedeutet: kein Fehler. */
  emailError?: string | null
  /** Zeitpunkt des letzten Versuchs, unabhaengig vom Ausgang. */
  emailLastAttemptAt?: string | null
  className?: string
}

/**
 * Zeigt einen fehlgeschlagenen Mailversand dort, wo das Dokument steht.
 *
 * Der Versand laeuft asynchron: Wenn er scheitert, gibt es keinen Request mehr,
 * dem man einen Toast zeigen koennte. Ohne diese Anzeige sieht ein gescheiterter
 * Versand genauso aus wie ein nie angestossener — der Unterschied, der 2026 fuenf
 * Wochen Mailausfall unbemerkt gelassen hat.
 *
 * Rendert nichts, solange kein Fehler vorliegt.
 */
export function EmailSendStatus({ emailError, emailLastAttemptAt, className }: EmailSendStatusProps) {
  const { t } = useTranslation()

  if (!emailError) return null

  return (
    <div
      data-testid="email-send-error"
      className={`rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t('emailStatus.failed')}
      </div>
      <p className="mt-1 break-words text-muted-foreground">{emailError}</p>
      {emailLastAttemptAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('emailStatus.lastAttempt', { when: formatDateTime(emailLastAttemptAt) })}
        </p>
      )}
    </div>
  )
}

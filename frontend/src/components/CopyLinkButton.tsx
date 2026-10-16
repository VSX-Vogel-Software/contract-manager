import { Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { buildLinkUrl } from '@/lib/linkTarget'
import { pushToast } from '@/lib/toastStore'

interface CopyLinkButtonProps {
  /** `id` des Sprungziels; ohne -> Link auf die aktuelle Ansicht (inkl. Tabs). */
  targetId?: string
  /** Andere Ansicht als die aktuelle, etwa der Vertrag zu einem Todo. */
  path?: string
  className?: string
  /**
   * Nur beim Ueberfahren der umgebenden `group/link` zeigen (benannte
   * Gruppe, damit aeussere `group`-Container nicht alle Knoepfe zugleich
   * einblenden). Touch-Geraete kennen kein Ueberfahren - dort bleibt er sichtbar.
   */
  revealOnHover?: boolean
}

/**
 * Kleiner Knopf, der einen Link auf die aktuelle Ansicht oder ein
 * Sprungziel darin kopiert. Wer den Link oeffnet, landet im richtigen Tab,
 * die Seite rollt zum Ziel und hebt es kurz hervor (siehe lib/linkTarget).
 */
export function CopyLinkButton({ targetId, path, className, revealOnHover = true }: CopyLinkButtonProps) {
  const { t } = useTranslation()

  const copy = async (e: React.MouseEvent) => {
    // Zeilen und Karten sind oft selbst klickbar
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(buildLinkUrl(targetId, path))
      pushToast({ title: t('common.linkCopied'), variant: 'success' })
    } catch {
      pushToast({ title: t('common.linkCopyFailed') })
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={t('common.copyLinkHere')}
      aria-label={t('common.copyLinkHere')}
      data-testid={targetId ? `copy-link-${targetId}` : 'copy-link'}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-opacity hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        revealOnHover && 'opacity-0 group-hover/link:opacity-100 [@media(hover:none)]:opacity-100',
        className,
      )}
    >
      <Link2 className="h-3.5 w-3.5" />
    </button>
  )
}

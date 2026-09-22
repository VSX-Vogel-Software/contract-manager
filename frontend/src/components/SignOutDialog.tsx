import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Die Wahl beim Abmelden einer SSO-Sitzung.
 *
 * Wer sich nur hier abmeldet, bleibt bei Microsoft angemeldet - der naechste
 * Klick auf "Anmelden" fuehrt dann wortlos wieder hinein. Auf dem eigenen
 * Rechner ist das bequem, auf einem geteilten eine Ueberraschung. Deshalb die
 * Frage statt einer stillen Annahme.
 */
export function SignOutDialog({
  open,
  onOpenChange,
  onSignOutHere,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSignOutHere: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="sign-out-dialog">
        <DialogHeader>
          <DialogTitle>{t('auth.signOutDialog.title')}</DialogTitle>
          <DialogDescription>{t('auth.signOutDialog.description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={onSignOutHere} data-testid="sign-out-here">
            {t('auth.signOutDialog.hereOnly')}
          </Button>
          <Button
            onClick={() => {
              // Erst die eigene Sitzung raeumen, dann zum Verzeichnis: sonst
              // kaeme der Benutzer mit gueltigem Token zurueck.
              onSignOutHere()
              window.location.href = '/auth/entra/logout'
            }}
            data-testid="sign-out-everywhere"
          >
            {t('auth.signOutDialog.everywhere')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

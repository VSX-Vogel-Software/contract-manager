"""Versandzustand am Dokument festhalten - Erfolg wie Fehlschlag.

Anlass ist der Ausfall vom 17.08. bis 21.09.2026: Der Mailversand stand fuenf
Wochen still, und an keinem Beleg war zu sehen, warum. Der Grund stand nur in
einer Logzeile im Worker.

Warum nicht einfach eine Ausnahme werfen: Die vier Versandpfade laufen
ausschliesslich als Celery-Task (`.delay(...)`). Es gibt keinen Aufrufer, der
eine Ausnahme saehe - die Mutation ist beantwortet, lange bevor der Task
anlaeuft. Ein `raise` faerbte nur den Task im Broker rot, und den sieht niemand.
Beim Abwesenheitsbericht war ein `raise` richtig, weil der synchron aus
"Jetzt senden" laeuft.

Dass Erfolg und Fehlschlag hier gemeinsam liegen, ist Absicht: Das Abraeumen des
alten Fehlers im Erfolgsfall ist die Haelfte, die man sonst in einem von vier
Pfaden vergisst - und dann klebt an einer zugestellten Rechnung dauerhaft der
Fehler des ersten Versuchs.
"""

from django.utils import timezone

#: Graph-Fehlertexte sind Saetze, keine Codes. Sie werden unveraendert
#: uebernommen, aber begrenzt, damit ein ungewoehnlich langer Text keine
#: Anzeige sprengt.
MAX_ERROR_LENGTH = 1000


def record_send_failure(obj, error, *, save: bool = True) -> None:
    """Haelt den Grund des Fehlschlags am Dokument fest.

    ``email_sent_at`` bleibt unberuehrt - ein gescheiterter Versuch macht aus
    einer frueher zugestellten Mail keine ungesendete.
    """
    obj.email_error = str(error)[:MAX_ERROR_LENGTH]
    obj.email_last_attempt_at = timezone.now()
    if save:
        obj.save(update_fields=["email_error", "email_last_attempt_at"])


def record_send_success(obj, *, extra_fields=None, save: bool = True) -> list:
    """Raeumt einen alten Fehler ab und vermerkt den Versuch.

    Gibt die Feldnamen zurueck, die dabei gesetzt wurden, damit der Aufrufer sie
    seinem eigenen ``update_fields`` anhaengen kann, statt ein zweites Mal zu
    speichern.
    """
    obj.email_error = ""
    obj.email_last_attempt_at = timezone.now()
    fields = ["email_error", "email_last_attempt_at"]
    if extra_fields:
        fields = list(extra_fields) + fields
    if save:
        obj.save(update_fields=fields)
    return fields

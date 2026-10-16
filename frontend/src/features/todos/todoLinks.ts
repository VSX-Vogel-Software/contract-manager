import { linkTargetId } from '@/lib/linkTarget'

interface TodoRef {
  id: number | string
  contractId?: number | string | null
  customerId?: number | string | null
}

/** Todo-Tab der Akte (Vertrag oder Kunde), an der das Todo haengt. */
export function todoEntityPath(todo: TodoRef): string | null {
  if (todo.contractId) return `/contracts/${todo.contractId}?tab=todos`
  if (todo.customerId) return `/customers/${todo.customerId}?tab=todos`
  return null
}

/** Link direkt auf das Todo in seiner Akte - die Seite rollt hin und hebt es hervor. */
export function todoEntityLink(todo: TodoRef): string {
  const path = todoEntityPath(todo)
  return path ? `${path}#${linkTargetId('todo', todo.id)}` : '#'
}

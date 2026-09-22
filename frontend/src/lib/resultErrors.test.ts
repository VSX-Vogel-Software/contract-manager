import { describe, it, expect, beforeEach } from 'vitest'
import { collectResultErrors, handleMutationResult } from './resultErrors'
import { getToasts, resetToasts } from './toastStore'

function operation(context: Record<string, unknown> = {}) {
  return { operationName: 'SaveThing', getContext: () => context }
}

describe('collectResultErrors', () => {
  it('finds the reason in a failed payload', () => {
    expect(
      collectResultErrors({ saveThing: { success: false, error: 'Customer not found' } })
    ).toEqual(['Customer not found'])
  })

  it('stays quiet when the payload succeeded', () => {
    expect(collectResultErrors({ saveThing: { success: true, error: null } })).toEqual([])
  })

  it('reports a failure even without a reason, because silence is worse', () => {
    expect(collectResultErrors({ saveThing: { success: false, error: null } })).toEqual([''])
  })

  it('reads the list form used by the provisioning result', () => {
    expect(
      collectResultErrors({
        provisionClockodoProjects: {
          success: false,
          errors: ['Contract not found', 'No items selected'],
        },
      })
    ).toEqual(['Contract not found', 'No items selected'])
  })

  it('collects from several payloads in one response', () => {
    expect(
      collectResultErrors({
        first: { success: false, error: 'Erster' },
        second: { success: false, error: 'Zweiter' },
      })
    ).toEqual(['Erster', 'Zweiter'])
  })

  it('ignores payloads that carry no success flag', () => {
    // Mutationen, die direkt die Entitaet zurueckgeben, haben kein success.
    expect(collectResultErrors({ createCustomer: { id: '1', name: 'ACME' } })).toEqual([])
  })

  it('survives scalars, null and an empty response', () => {
    expect(collectResultErrors({ deleteThing: true })).toEqual([])
    expect(collectResultErrors({ thing: null })).toEqual([])
    expect(collectResultErrors(null)).toEqual([])
    expect(collectResultErrors(undefined)).toEqual([])
  })
})

describe('handleMutationResult', () => {
  beforeEach(() => {
    resetToasts()
  })

  it('shows a payload failure that the component swallows today', () => {
    handleMutationResult({
      data: { sendReportNow: { success: false, error: 'No recipients configured' } },
      operation: operation(),
    })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].description).toContain('No recipients configured')
  })

  it('stays silent when the component shows the error itself', () => {
    handleMutationResult({
      data: { sendReportNow: { success: false, error: 'No recipients configured' } },
      operation: operation({ suppressErrorToast: true }),
    })

    expect(getToasts()).toHaveLength(0)
  })

  it('stays silent on success', () => {
    handleMutationResult({
      data: { sendReportNow: { success: true, error: null } },
      operation: operation(),
    })

    expect(getToasts()).toHaveLength(0)
  })
})

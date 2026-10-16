import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { buildLinkUrl, currentLinkTarget, linkTargetId, useLinkTarget } from './linkTarget'

function Harness({ showLater }: { showLater?: boolean }) {
  useLinkTarget()
  const [visible, setVisible] = useState(!showLater)
  return (
    <div>
      <button onClick={() => setVisible(true)}>show</button>
      {visible && <div id="todo-5">Ziel</div>}
    </div>
  )
}

describe('linkTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom kennt weder Layout noch scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  })

  it('baut Kennungen und liest sie aus der Adresse', () => {
    expect(linkTargetId('todo', 5)).toBe('todo-5')
    expect(currentLinkTarget('#todo-5')).toBe('todo-5')
    expect(currentLinkTarget('')).toBeNull()
    expect(currentLinkTarget('#')).toBeNull()
  })

  it('haengt das Sprungziel an die aktuelle Adresse', () => {
    expect(buildLinkUrl('todo-5', '/contracts/1?tab=todos')).toBe(
      `${window.location.origin}/contracts/1?tab=todos#todo-5`,
    )
  })

  it('rollt zum vorhandenen Ziel und hebt es hervor', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/x#todo-5']}>
        <Harness />
      </MemoryRouter>,
    )
    act(() => { vi.runOnlyPendingTimers() })
    const el = container.querySelector('#todo-5')!
    expect(el.scrollIntoView).toHaveBeenCalled()
    expect(el.classList.contains('link-target-flash')).toBe(true)
  })

  it('wartet auf ein Ziel, das erst spaeter erscheint', () => {
    const { container, getByText } = render(
      <MemoryRouter initialEntries={['/x#todo-5']}>
        <Harness showLater />
      </MemoryRouter>,
    )
    expect(container.querySelector('#todo-5')).toBeNull()
    act(() => { getByText('show').click() })
    // MutationObserver feuert als Microtask
    return Promise.resolve().then(() => {
      act(() => { vi.runOnlyPendingTimers() })
      expect(container.querySelector('#todo-5')!.classList.contains('link-target-flash')).toBe(true)
    })
  })
})

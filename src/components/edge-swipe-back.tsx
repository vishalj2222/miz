'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { EDGE_PX, classifyDrag, shouldGoBack } from '@/lib/swipe'

// Installed iOS web apps have no system back gesture, so we provide one:
// drag from the left edge and the page follows the finger; release past a
// third (or flick) to go back. Off where back is meaningless or risky —
// home, login, and the capture screen (an unsaved note lives there).
const DISABLED = ['/', '/login', '/capture']
const SETTLE_MS = 180

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

export function EdgeSwipeBack() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (DISABLED.includes(pathname) || !isStandalone()) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let start: { x: number; y: number; t: number } | null = null
    let state: 'swipe' | 'scroll' | 'undecided' = 'undecided'
    let page: HTMLElement | null = null

    const setOffset = (px: number, animate: boolean) => {
      if (!page || reduceMotion) return
      page.style.transition = animate ? `transform ${SETTLE_MS}ms ease-out` : 'none'
      page.style.transform = px ? `translateX(${px}px)` : ''
    }

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length !== 1 || t.clientX > EDGE_PX) return
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp }
      state = 'undecided'
      page = document.querySelector('main')
    }

    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (state === 'undecided') state = classifyDrag(dx, dy)
      if (state === 'scroll') {
        start = null
        return
      }
      if (state === 'swipe') {
        e.preventDefault() // hold the page still vertically while swiping
        setOffset(Math.max(0, dx), false)
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const goBack = state === 'swipe' && shouldGoBack(dx, e.timeStamp - start.t, window.innerWidth)
      start = null
      if (!goBack) {
        setOffset(0, true)
        return
      }
      setOffset(window.innerWidth, true)
      window.setTimeout(
        () => (window.history.length > 1 ? router.back() : router.push('/')),
        reduceMotion ? 0 : SETTLE_MS,
      )
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
      // If React reuses the <main> node on the next page, don't leave it offset.
      if (page) {
        page.style.transition = ''
        page.style.transform = ''
      }
    }
  }, [pathname, router])

  return null
}

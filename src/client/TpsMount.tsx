import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TpsOverlay, type TpsOverlayProps } from './TpsOverlay.tsx'

type TpsMountProps = TpsOverlayProps & { sessionId: string }

/** The dock supplies session hooks; the badge lives in that session's status row. */
export function TpsMount(props: TpsMountProps) {
  return <SessionTpsMount key={props.sessionId} {...props} />
}

function SessionTpsMount({ sessionId, ...props }: TpsMountProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [target, setTarget] = useState<HTMLSpanElement | null>(null)
  const running = props.useSession(snapshot => snapshot.running)

  useLayoutEffect(() => {
    const scope = anchor.current?.closest('[data-conversation-scroll]')
    if (!running || scope === undefined || scope === null) return

    let flow: Element | null = null
    let row: Element | null = null
    let container: HTMLSpanElement | null = null

    const reconcile = () => {
      flow = scope.querySelector('[data-chat-flow]')
      const next = flow?.querySelector(':scope > [role="status"][aria-live="polite"]') ?? null
      if (next !== row) {
        container?.remove()
        row = next
        container = next === null ? null : document.createElement('span')
        if (container !== null) container.dataset.tpsMount = ''
        setTarget(container)
      }
      // React may append the elapsed clock later, or replace the row's content.
      // Only our container moves; host-owned children retain their original parent.
      if (row !== null && container !== null && row.lastChild !== container) {
        row.appendChild(container)
      }
    }

    const observer = new MutationObserver(records => {
      // Streaming message interiors do not change the status seat. Watch direct
      // flow/row changes and ancestor replacement, without rescanning each delta.
      if (flow === null || !scope.contains(flow) || records.some(record =>
        record.target === row || record.target === flow || record.target.contains(flow),
      )) reconcile()
    })
    observer.observe(scope, { childList: true, subtree: true })
    reconcile()
    return () => {
      observer.disconnect()
      container?.remove()
      setTarget(null)
    }
  }, [running, sessionId])

  return <>
    <span ref={anchor} hidden data-tps-anchor="" />
    {running && target !== null && createPortal(<TpsOverlay {...props} />, target)}
  </>
}

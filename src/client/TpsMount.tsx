import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TpsOverlay, type TpsOverlayProps } from './TpsOverlay.tsx'

type TpsMountProps = TpsOverlayProps & { sessionId: string }

/** The dock supplies session hooks; the badge lives in that session's status row. */
export function TpsMount(props: TpsMountProps) {
  return <SessionTpsMount key={props.sessionId} {...props} />
}

/**
 * The DOM seat the badge renders into for a status row. DSH 0.1.x renders the
 * row itself as `[role="status"][aria-live="polite"]`; 0.2.x renders
 * `div[data-chat-running]` holding a visually hidden status span, the divider,
 * and the visible content span — so the seat is that content span, keeping the
 * badge inline with the "Deep diving…" copy. The class token is hashed
 * (`[hash]_runningContent`), the visible-span pick is the shape-based fallback,
 * and the row itself backs both up for whichever shape changes next.
 * @param row - the running-turn status row (or its 0.1.x role=status seat).
 * @returns the element to append the badge container to.
 */
function statusSeat(row: Element): Element {
  const content = row.querySelector(':scope > span[class*="runningContent"]')
  if (content !== null) return content
  const spans = [...row.querySelectorAll(':scope > span')].filter(span =>
    span.getAttribute('role') !== 'status' && span.getAttribute('aria-hidden') !== 'true')
  return spans.length === 0 ? row : spans[spans.length - 1]
}

function SessionTpsMount({ sessionId, ...props }: TpsMountProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const running = props.useSession(snapshot => snapshot.running)

  useLayoutEffect(() => {
    const scope = anchor.current?.closest('[data-conversation-scroll]')
    if (!running || scope === undefined || scope === null) return

    let flow: Element | null = null
    let row: Element | null = null
    let seat: Element | null = null
    let container: HTMLSpanElement | null = null

    // `[data-chat-flow]` also names the step-process body, so prefer the column
    // that actually holds a running row; the direct-child role=status row is
    // the 0.1.x shape and stays as the fallback.
    const findStatusRow = (): Element | null => {
      const flows = scope.querySelectorAll('[data-chat-flow]')
      for (const candidate of flows) {
        const runningRow = candidate.querySelector(':scope > [data-chat-running]')
        if (runningRow !== null) {
          flow = candidate
          return runningRow
        }
      }
      flow = flows[0] ?? null
      return flow?.querySelector(':scope > [role="status"][aria-live="polite"]') ?? null
    }

    const reconcile = () => {
      const nextRow = findStatusRow()
      const nextSeat = nextRow === null ? null : statusSeat(nextRow)
      if (nextRow !== row || nextSeat !== seat) {
        container?.remove()
        row = nextRow
        seat = nextSeat
        container = seat === null ? null : document.createElement('span')
        if (container !== null) container.dataset.tpsMount = ''
        setTarget(container)
      }
      // React may append the elapsed clock later, or replace the row's content.
      // Only our container moves; host-owned children retain their original parent.
      if (seat !== null && container !== null && seat.lastChild !== container) {
        seat.appendChild(container)
      }
    }

    const observer = new MutationObserver(records => {
      // Streaming message interiors do not change the status seat. Watch direct
      // flow/row changes and ancestor replacement, without rescanning each delta.
      if (flow === null || !scope.contains(flow) || records.some(record =>
        record.target === seat || record.target === row || record.target === flow ||
        record.target.contains(flow),
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

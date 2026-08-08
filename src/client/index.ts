/**
 * TPS badge plugin, browser half: one entry in the running-turn status
 * row's trailing seat. Pure reader — the live rate derives from the
 * streaming partial of the conversation snapshot, so the plugin owns no
 * store, no event listener, and no wire calls. The /client export surface
 * is the plugin body (`apply`/`inject`), the component, and the contract
 * types.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the turn-status slot).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TpsOverlay } from './TpsOverlay.tsx'
import { en, zh, type TpsKey } from './locales.ts'

export { TpsOverlay } from './TpsOverlay.tsx'
export type { BadgePhase, Point, Rect, TpsOverlayProps } from './TpsOverlay.tsx'
export type { TpsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The tps badge's copy. */
    tps: TpsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'tps'

/** Required services: slots for the turn-status entry, locale for the copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: the running-turn TPS badge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-tps: dictionaries')
  ctx.slots.inject('conversation.chat.turnStatus', () => ctx.slots.register({
    name: 'conversation.chat.turnStatus',
    locale: NS,
  }, TpsOverlay))
}

/**
 * TPS badge plugin, browser half: a session-scoped dock entry projects the
 * live rate into the running-turn status row through a DOM portal. Data
 * comes from the rc.1 Session/Chat snapshots without wire calls or stores.
 * The /client export surface
 * is the plugin body (`apply`/`inject`), the component, and the contract
 * types.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: supplies the session-scoped Chat selector.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: pulls the target-neutral Conversation declarations.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: supplies session-scoped standard props (useSession/sessionId).
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { TpsMount } from './TpsMount.tsx'
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

/** Required services: slots for the session entry, locale for the copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: the running-turn TPS badge.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-tps: dictionaries')
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'tps',
    locale: NS,
  }, TpsMount))
}

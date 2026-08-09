/**
 * Shared CSS Modules inlining plugin for the main and prepare tsdown
 * configs: compiles `*.module.css` with lightningcss and emits a virtual
 * module that injects a deduplicated `<style data-plugin-css>` tag and
 * exports the class map — the same artifact contract as the in-repo
 * dsh-client-* packages.
 * @module
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { transform } from 'lightningcss'
import type { TsdownPlugin } from 'tsdown'

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Build a CSS-modules-inline plugin for the given client bundle id.
 * @param clientId - loader table id; scopes the injected style tags.
 * @returns the tsdown plugin.
 */
export function cssModulesPlugin(clientId: string): TsdownPlugin {
  return {
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      let abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
      // The main build bundles tsc's lib/types output, which copies the css
      // import verbatim; the stylesheet itself stays in src, so rebase the
      // emitted path onto the source tree (a no-op for src-based entries).
      abs = abs.split(`${sep}lib${sep}types${sep}`).join(`${sep}src${sep}`)
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      // Sorted keys keep the emitted class map deterministic: lightningcss's
      // export iteration order is unstable across runs.
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        classMap[local] = exp.name
      }
      const tagId = `${clientId}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
        `  const tag = document.createElement('style');`,
        `  tag.dataset.plugin = ${JSON.stringify(clientId)};`,
        `  tag.dataset.pluginCss = tagId;`,
        `  tag.textContent = css;`,
        `  document.head.appendChild(tag);`,
        `}`,
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

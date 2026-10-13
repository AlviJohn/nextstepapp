import type { Size } from './api'

export type Parsed = { title: string; importance: number | null; size: Size | null }

// "Fix login bug p5 #s" → { title: "Fix login bug", importance: 5, size: "S" }
// Priority: p1–p5 or !1–!5. Size: #xs #s #m #l #xl. Tokens must stand alone, so
// words like "map5" or "#slack" are left untouched.
const PRIORITY_RE = /(^|\s)(?:p|!)([1-5])(?=\s|$)/i
const SIZE_RE = /(^|\s)#(xs|s|m|l|xl)(?=\s|$)/i

export function parseQuickAdd(raw: string): Parsed {
  let text = raw
  let importance: number | null = null
  let size: Size | null = null
  const p = text.match(PRIORITY_RE)
  if (p) {
    importance = Number(p[2])
    text = text.replace(PRIORITY_RE, '$1')
  }
  const s = text.match(SIZE_RE)
  if (s) {
    size = s[2].toUpperCase() as Size
    text = text.replace(SIZE_RE, '$1')
  }
  return { title: text.replace(/\s+/g, ' ').trim(), importance, size }
}

/** Remove any priority/size tokens, e.g. after the user picks a value with the mouse instead. */
export function stripToken(raw: string, kind: 'priority' | 'size'): string {
  return raw.replace(kind === 'priority' ? PRIORITY_RE : SIZE_RE, '$1').replace(/\s{2,}/g, ' ')
}

/** Split pasted text into tasks: one per line, ignoring bullets and checkboxes. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
    .filter(Boolean)
}

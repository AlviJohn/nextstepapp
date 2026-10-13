import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

type GoogleId = {
  initialize: (opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let scriptPromise: Promise<void> | null = null
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

/** Google's own rendered button (required by their branding rules). Hidden when no client ID is configured. */
export default function GoogleButton({ onCredential, text }: { onCredential: (c: string) => void; text: 'signin_with' | 'signup_with' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const cb = useRef(onCredential)
  cb.current = onCredential

  useEffect(() => {
    api<{ google_client_id: string | null }>('/auth/config')
      .then((c) => setClientId(c.google_client_id))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!clientId || !ref.current) return
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current(r.credential) })
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text,
          width: Math.min(ref.current.offsetWidth || 320, 400),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId, text])

  if (!clientId) return null
  return (
    <>
      <div ref={ref} className="flex h-11 w-full justify-center" />
      <div className="my-5 flex items-center gap-3 text-xs text-mute">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>
    </>
  )
}

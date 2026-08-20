/* Server-side saves. The client keeps only an opaque session token in
   localStorage — the save itself lives on the backend. A local cache copy
   exists purely so the PWA can resume offline; it re-syncs when online. */

const API = ((import.meta.env?.VITE_SERVER_URL as string | undefined) || '').replace(/\/$/, '')
const TOKEN_KEY = 'stowage:token'
const CACHE_KEY = 'stowage:cache'

const hasDOM = typeof window !== 'undefined' && typeof localStorage !== 'undefined'

let token: string | null = hasDOM ? localStorage.getItem(TOKEN_KEY) : null
let timer: number | null = null
let pending: unknown
let dirty = false

async function ensureSession(): Promise<string | null> {
  if (token) return token
  try {
    const r = await fetch(`${API}/api/session`, { method: 'POST' })
    if (!r.ok) return null
    token = (await r.json()).token as string
    localStorage.setItem(TOKEN_KEY, token)
    return token
  } catch {
    return null
  }
}

async function push(save: unknown) {
  const t = await ensureSession()
  if (!t) {
    dirty = true
    return
  }
  try {
    const r = await fetch(`${API}/api/save`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ save })
    })
    if (r.status === 404 || r.status === 401) {
      // session unknown to the server — drop it and re-establish next push
      token = null
      localStorage.removeItem(TOKEN_KEY)
      dirty = true
      return
    }
    dirty = !r.ok
  } catch {
    dirty = true
  }
}

export function scheduleSave(save: unknown) {
  pending = save
  if (!hasDOM) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(save))
  } catch {
    /* storage full or blocked — server copy still goes out */
  }
  if (timer !== null) return
  timer = window.setTimeout(() => {
    timer = null
    void push(pending)
  }, 1200)
}

export function clearRemoteSave() {
  pending = null
  if (!hasDOM) return
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
  void push(null)
}

export async function loadSave(): Promise<unknown | null> {
  if (!hasDOM) return null
  if (token) {
    try {
      const r = await fetch(`${API}/api/save`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const d = await r.json()
        if (d.save) return d.save
      } else if (r.status === 404 || r.status === 401) {
        token = null
        localStorage.removeItem(TOKEN_KEY)
      }
    } catch {
      /* offline — fall through to the local cache */
    }
  }
  try {
    const c = localStorage.getItem(CACHE_KEY)
    if (c) return JSON.parse(c)
  } catch {
    /* corrupt cache */
  }
  return null
}

if (hasDOM)
  window.addEventListener('online', () => {
    if (dirty) void push(pending)
  })

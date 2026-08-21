/* Highscores. Server-side like the save, keyed by the same opaque session
   token, with a local cache so the board still reads offline. Kept to the top
   five — the design shows five rows. */

const API = ((import.meta.env?.VITE_SERVER_URL as string | undefined) || '').replace(/\/$/, '')
const TOKEN_KEY = 'stowage:token'
const CACHE_KEY = 'stowage:scores'
const KEEP = 5

const hasDOM = typeof window !== 'undefined' && typeof localStorage !== 'undefined'

export interface Score {
  credits: number
  delivered: number
  stage: number
  cleared: number
  hull: string
  kind: 'retired' | 'bust'
  why: string
  seed: string
  at: number
}

function readCache(): Score[] {
  if (!hasDOM) return []
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const list = raw ? (JSON.parse(raw) as Score[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeCache(list: Score[]) {
  if (!hasDOM) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    /* storage blocked — the server copy still stands */
  }
}

function rank(list: Score[]): Score[] {
  return list.slice().sort((a, b) => b.credits - a.credits || b.at - a.at).slice(0, KEEP)
}

/** In-memory board, hydrated by loadScores() and updated by recordScore(). */
let board: Score[] = readCache()
const subs = new Set<() => void>()

export function getScores(): Score[] {
  return board
}

export function subscribeScores(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}

function announce() {
  subs.forEach((f) => f())
}

async function push() {
  if (!hasDOM) return
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return // no session yet; the cache carries it until there is one
  try {
    await fetch(`${API}/api/scores`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scores: board })
    })
  } catch {
    /* offline — the cache is authoritative until the next successful push */
  }
}

export function recordScore(s: Omit<Score, 'at'>) {
  board = rank([...board, { ...s, at: Date.now() }])
  writeCache(board)
  announce()
  void push()
}

export async function loadScores(): Promise<Score[]> {
  if (!hasDOM) return board
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    try {
      const r = await fetch(`${API}/api/scores`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const d = await r.json()
        if (Array.isArray(d.scores)) {
          // merge: whichever side has runs the other lacks, keep the best five
          const merged = rank([...board, ...(d.scores as Score[])])
          const changed = JSON.stringify(merged) !== JSON.stringify(board)
          board = merged
          writeCache(board)
          if (changed) {
            announce()
            void push()
          }
        }
      }
    } catch {
      /* offline — cache stands */
    }
  }
  return board
}

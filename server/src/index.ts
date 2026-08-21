import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data', 'saves')

const app = express()
// allow Netlify frontend to connect
app.use(cors())
app.use(express.json({ limit: '256kb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))
// Client hits this from the boot screen to wake the server from a cold start.
app.get('/wake', (_req, res) => res.json({ awake: true }))

function fileFor(token: string): string {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  return path.join(DATA_DIR, `${hash}.json`)
}

function bearer(req: express.Request): string | null {
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return null
  const t = h.slice(7)
  return /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null
}

// Issue an opaque session token. The token is the only thing the client keeps;
// the save itself never lives client-side except as an offline cache.
app.post('/api/session', async (_req, res) => {
  const token = crypto.randomBytes(24).toString('base64url')
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(fileFor(token), JSON.stringify({ createdAt: Date.now(), updatedAt: Date.now(), save: null }))
  res.json({ token })
})

app.get('/api/save', async (req, res) => {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'no token' })
  try {
    const raw = await fs.readFile(fileFor(token), 'utf8')
    const rec = JSON.parse(raw)
    res.json({ save: rec.save, updatedAt: rec.updatedAt })
  } catch {
    res.status(404).json({ error: 'unknown session' })
  }
})

app.put('/api/save', async (req, res) => {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'no token' })
  const file = fileFor(token)
  let prev: Record<string, unknown>
  try {
    prev = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return res.status(404).json({ error: 'unknown session' })
  }
  const save = req.body?.save
  if (save !== null && typeof save !== 'object') return res.status(400).json({ error: 'bad save' })
  // merge, never replace: the record also holds the highscore board
  const rec = { ...prev, updatedAt: Date.now(), save }
  await fs.writeFile(file, JSON.stringify(rec))
  res.json({ ok: true, updatedAt: rec.updatedAt })
})

/* Highscores live beside the save, under the same session token. Kept to the
   top five so a bad actor cannot grow the file without bound. */
const KEEP = 5

app.get('/api/scores', async (req, res) => {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'no token' })
  try {
    const rec = JSON.parse(await fs.readFile(fileFor(token), 'utf8'))
    res.json({ scores: Array.isArray(rec.scores) ? rec.scores : [] })
  } catch {
    res.status(404).json({ error: 'unknown session' })
  }
})

app.put('/api/scores', async (req, res) => {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'no token' })
  const file = fileFor(token)
  let rec: Record<string, unknown>
  try {
    rec = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return res.status(404).json({ error: 'unknown session' })
  }
  const list = req.body?.scores
  if (!Array.isArray(list)) return res.status(400).json({ error: 'bad scores' })
  const scores = list
    .filter((s) => s && typeof s === 'object' && typeof s.credits === 'number')
    .slice(0, 50)
    .sort((a, b) => b.credits - a.credits)
    .slice(0, KEEP)
  await fs.writeFile(file, JSON.stringify({ ...rec, scores, updatedAt: Date.now() }))
  res.json({ ok: true, kept: scores.length })
})

const PORT = Number(process.env.PORT) || 3001
app.listen(PORT, () => console.log(`stowage server on :${PORT}`))

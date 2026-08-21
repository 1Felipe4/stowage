import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { drawShareCard, shareText, type ShareFacts } from './shareCard'

/* The share sheet: paints the run card on open (so a later tap on Share is
   still inside the user gesture the Web Share API needs), then offers native
   share, clipboard, save, and a plain-text fallback. */
export function ShareSheet({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [facts, setFacts] = useState<ShareFacts | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let dead = false
    void drawShareCard()
      .then(({ blob, url: u, facts: f }) => {
        if (dead) {
          URL.revokeObjectURL(u)
          return
        }
        blobRef.current = blob
        urlRef.current = u
        setUrl(u)
        setFacts(f)
      })
      .catch(() => !dead && setErr('The card could not be drawn on this device.'))
    return () => {
      dead = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  function flash(m: string) {
    setNote(m)
    window.setTimeout(() => setNote(null), 2200)
  }

  const file = () => (blobRef.current ? new File([blobRef.current], 'stowage-run.png', { type: 'image/png' }) : null)
  const canShareFile = () => {
    const f = file()
    return !!(f && navigator.canShare?.({ files: [f] }))
  }

  async function nativeShare() {
    const f = file()
    if (!f || !facts) return
    try {
      await navigator.share({ files: [f], title: 'STOWAGE', text: shareText(facts) })
    } catch (e) {
      // an aborted share is a normal user action, not an error worth shouting about
      if ((e as Error)?.name !== 'AbortError') flash('Sharing was refused — try Save instead.')
    }
  }

  async function copyImage() {
    if (!blobRef.current) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobRef.current })])
      flash('Card copied — paste it anywhere.')
    } catch {
      flash('This browser will not copy images. Use Save.')
    }
  }

  function save() {
    if (!urlRef.current) return
    const a = document.createElement('a')
    a.href = urlRef.current
    a.download = `stowage-${facts?.seed ?? 'run'}.png`
    a.click()
    flash('Saved to your downloads.')
  }

  async function copyLine() {
    if (!facts) return
    try {
      await navigator.clipboard.writeText(shareText(facts))
      flash('Text copied.')
    } catch {
      flash('Clipboard is blocked here.')
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sharecard" onClick={(e) => e.stopPropagation()}>
        <div className="kick">
          <Icon k="SHARE" />
          <span>SHARE THIS RUN</span>
          <button className="xbtn" onClick={onClose} aria-label="Close">
            <Icon k="X" />
          </button>
        </div>

        <div className="preview">
          {err ? <div className="perr">{err}</div> : url ? <img src={url} alt="Run summary card" /> : <div className="pwait">DRAWING THE CARD…</div>}
        </div>

        {!err && (
          <div className="sbtns">
            {canShareFile() && (
              <button className="btn pri" onClick={nativeShare} disabled={!url}>
                Share
              </button>
            )}
            <button className="btn" onClick={copyImage} disabled={!url}>
              Copy image
            </button>
            <button className="btn" onClick={save} disabled={!url}>
              Save PNG
            </button>
            <button className="btn" onClick={copyLine} disabled={!facts}>
              Copy text
            </button>
          </div>
        )}
        {note && <div className="snote">{note}</div>}
      </div>
    </div>
  )
}

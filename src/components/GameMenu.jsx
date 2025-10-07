import React, { useEffect, useRef, useState } from 'react'
import '../styles/menu.css'
import Lobby from './Lobby.jsx'
import Scoreboard from './Scoreboard.jsx'

export default function GameMenu({ sensitivity = 0.35, setSensitivity = () => {}, fov = 75, setFov = () => {}, crosshair = { size: 20, thickness: 1.5, gap: 4, color: '#00ff00', showDot: true }, setCrosshair = () => {}, targetSize = 1.5, setTargetSize = () => {}, gameDuration = 30, setGameDuration = () => {} }) {
  const [showSettings, setShowSettings] = useState(false)
  const [lobbyMode, setLobbyMode] = useState(null)
  const [showPractice, setShowPractice] = useState(false)
  const [players, setPlayers] = useState([])
  const [error, setError] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [overlayHidden, setOverlayHidden] = useState(false)
  const [timeLeft, setTimeLeft] = useState(null)
  const [results, setResults] = useState(null)
  const [preStart, setPreStart] = useState(null)
  const [useTimerThisRun, setUseTimerThisRun] = useState(true)
  const [practiceEndless, setPracticeEndless] = useState(true)
  const [isPracticeRun, setIsPracticeRun] = useState(false)
  const [practicePaused, setPracticePaused] = useState(false)
  const [practiceShowSettings, setPracticeShowSettings] = useState(false)
  const playersRef = useRef(players)

  const setPlayersSafe = (updater) => {
    setPlayers((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      playersRef.current = next
      return next
    })
  }

  const handleCreate = () => {
    setLobbyMode('create')
    setShowPractice(false)
  }
  const handleJoin = () => {
    setLobbyMode('join')
    setShowPractice(false)
  }
  const handleSettings = () => {
    setShowSettings((s) => !s)
    if (!showSettings) setShowPractice(false)
  }
  const handlePractice = () => {
    setShowPractice((s) => !s)
    if (!showPractice) setLobbyMode(null)
  }

  const clamp = (v) => Math.min(3.0, Math.max(0.1, v))
  const step = 0.01
  const decrease = () => setSensitivity((s) => {
    const next = clamp(parseFloat((s - step).toFixed(2)))
    return next
  })
  const increase = () => setSensitivity((s) => {
    const next = clamp(parseFloat((s + step).toFixed(2)))
    return next
  })

  useEffect(() => {
    const onLocalHit = (e) => {
      const points = (e && e.detail && e.detail.points) || 1
      setPlayersSafe((prev) => {
        if (!prev.length) return prev
        const next = prev.map((p) => p.isLocal ? { ...p, score: (p.score ?? 0) + points } : p)
        return next
      })
      try { window.__aimTrainer?.peer?.send(JSON.stringify({ type: 'score', delta: points })) } catch {}
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        console.log('Escape pressed - playing:', playing, 'practicePaused:', practicePaused, 'isPracticeRun:', isPracticeRun)
        
        if (practicePaused && isPracticeRun) {
          console.log('Resuming practice from pause screen')
          setPracticePaused(false)
          setPracticeShowSettings(false)
          try { 
            window.__aimTrainer = window.__aimTrainer || {}
            window.__aimTrainer.paused = false 
          } catch {}
          try { 
            document.body.requestPointerLock && document.body.requestPointerLock() 
          } catch {}
          return
        }
        
        if (playing && isPracticeRun) {
          console.log('Pausing practice mode')
          setPracticePaused(true)
          try { 
            window.__aimTrainer = window.__aimTrainer || {}
            window.__aimTrainer.paused = true 
          } catch {}
          try { 
            document.exitPointerLock && document.exitPointerLock() 
          } catch {}
          return
        }
        
        if (!playing) {
          if (document.pointerLockElement) return
          setOverlayHidden((v) => !v)
        }
      }
    }
    const onLocalMiss = (e) => {
      const points = (e && e.detail && e.detail.points) || -1
      setPlayersSafe((prev) => {
        if (!prev.length) return prev
        const next = prev.map((p) => p.isLocal ? { ...p, score: (p.score ?? 0) + points } : p)
        return next
      })
      try { window.__aimTrainer?.peer?.send(JSON.stringify({ type: 'score', delta: points })) } catch {}
    }
    const onPointerLockChange = () => {
      if (!playing && !document.pointerLockElement) {
        setOverlayHidden(false)
      }
    }
    window.addEventListener('aim:hit', onLocalHit)
    window.addEventListener('aim:miss', onLocalMiss)
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    return () => {
      window.removeEventListener('aim:hit', onLocalHit)
      window.removeEventListener('aim:miss', onLocalMiss)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
    }
  }, [playing, practicePaused, isPracticeRun, practiceShowSettings])

  useEffect(() => {
    if (!playing) {
      setTimeLeft(null)
      return
    }
    if (!useTimerThisRun) return
    const duration = gameDuration
    setTimeLeft(duration)
    const startedAt = Date.now()
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      const remaining = Math.max(0, duration - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        handleEndGame()
      }
    }, 100)
    return () => clearInterval(id)
  }, [playing, gameDuration, useTimerThisRun])

  const handleEndGame = () => {
    setPlaying(false)
    const snapshot = playersRef.current || players
    const [p0, p1] = snapshot
    if (isPracticeRun) {
      const local = (snapshot || []).find(p => p.isLocal)
      setResults({ practice: true, score: (local && (local.score ?? 0)) || 0 })
    } else {
      const winner = !p1 ? p0?.nick : ((p0?.score ?? 0) === (p1?.score ?? 0) ? 'Tie' : ((p0?.score ?? 0) > (p1?.score ?? 0) ? p0?.nick : p1?.nick))
      setResults({ winner, scores: (snapshot || []).map(p => ({ nick: p.nick, score: p.score ?? 0 })) })
    }
    try { window.dispatchEvent(new Event('aim:stop')) } catch {}
    try { window.__aimTrainer?.peer?.send(JSON.stringify({ type: 'end' })) } catch {}
  }

  return (
    <>
      {!playing && !overlayHidden && (
      <div className="menu-backdrop" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="menu-panel" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            {!error && !showPractice && (
          <div className="menu-buttons">
            {!showSettings && !lobbyMode && (
              <>
                <button className="menu-btn" onClick={handleCreate}>Create Game</button>
                <button className="menu-btn" onClick={handleJoin}>Join Game</button>
                <button className="menu-btn" onClick={handlePractice}>{showPractice ? 'Back' : 'Practice'}</button>
                <button className="menu-btn" onClick={handleSettings}>Settings</button>
              </>
            )}

            {showSettings && !lobbyMode && (
              <div className="settings-panel">
                <div className="sensitivity-control">
                  <label className="settings-label">Sensitivity:</label>
                  <div className="sensitivity-value"><strong>{sensitivity.toFixed(2)}</strong></div>
                  <button className="small-btn" onClick={decrease}>−</button>
                  <button className="small-btn" onClick={increase}>+</button>
                </div>
                <input
                  className="settings-range"
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.01"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                />

                  <div className="sensitivity-control" style={{ marginTop: 12 }}>
                    <label className="settings-label">FOV:</label>
                    <div className="sensitivity-value"><strong>{fov}</strong></div>
                    <input
                      className="settings-range"
                      type="range"
                      min="60"
                      max="110"
                      step="1"
                      value={fov}
                      onChange={(e) => setFov(parseInt(e.target.value))}
                    />
                  </div>

                  <div className="sensitivity-control" style={{ marginTop: 12 }}>
                    <label className="settings-label">Crosshair Size: {crosshair.size}</label>
                    <input className="settings-range" type="range" min="6" max="60" step="1" value={crosshair.size} onChange={(e) => setCrosshair({ ...crosshair, size: parseInt(e.target.value) })} />
                    <label className="settings-label">Thickness: {crosshair.thickness}</label>
                    <input className="settings-range" type="range" min="1" max="8" step="0.5" value={crosshair.thickness} onChange={(e) => setCrosshair({ ...crosshair, thickness: parseFloat(e.target.value) })} />
                    <label className="settings-label">Gap: {crosshair.gap}</label>
                    <input className="settings-range" type="range" min="0" max="20" step="1" value={crosshair.gap} onChange={(e) => setCrosshair({ ...crosshair, gap: parseInt(e.target.value) })} />
                    <label className="settings-label">Show Dot:</label>
                    <input type="checkbox" checked={!!crosshair.showDot} onChange={(e) => setCrosshair({ ...crosshair, showDot: e.target.checked })} />
                    <label className="settings-label">Color:</label>
                    <input type="color" value={crosshair.color} onChange={(e) => setCrosshair({ ...crosshair, color: e.target.value })} style={{ marginLeft: 6 }} />
                  </div>
                <button className="menu-btn" onClick={handleSettings}>Back</button>
              </div>
            )}

          </div>
            )}

          {error && (
            <div style={{ color: '#ff4444', marginTop: '12px', marginBottom: '12px' }}>
              {error}
              <button 
                onClick={() => {
                  setError(null)
                  setLobbyMode(null)
                }}
                style={{ marginLeft: '8px', padding: '4px 8px' }}
              >
                Retry
              </button>
            </div>
          )}

            {showPractice && !error && !playing && (
              <div className="settings-panel">
                <div className="sensitivity-control" style={{ marginTop: 8 }}>
                  <label className="settings-label">Target Size: {targetSize.toFixed(1)}</label>
                  <input className="settings-range" type="range" min="0.5" max="3.0" step="0.1" value={targetSize} onChange={(e) => { const v = parseFloat(e.target.value); setTargetSize(v); try { localStorage.setItem('targetSize', String(v)) } catch {} }} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button className="menu-btn" onClick={() => setShowPractice(false)}>Back</button>
                  <button className="menu-btn" onClick={() => {
                    setLobbyMode(null)
                    setOverlayHidden(true)
                    setUseTimerThisRun(false)
                    setIsPracticeRun(true)
                    try { window.__aimTrainer = window.__aimTrainer || {}; window.__aimTrainer.paused = false } catch {}
                    try { window.dispatchEvent(new Event('aim:resetCamera')) } catch {}
                    try { document.exitPointerLock && document.exitPointerLock() } catch {}
                    let c = 3
                    setPreStart(c)
                    const id = setInterval(() => {
                      c -= 1
                      setPreStart(c)
                      if (c <= 0) {
                        clearInterval(id)
                        setPreStart(null)
                        setPlaying(true)
                        try { window.dispatchEvent(new Event('aim:start')) } catch {}
                      }
                    }, 1000)
                  }}>Start Practice</button>
                </div>
              </div>
            )}

          {lobbyMode && !error && !playing && (
            <Lobby 
              mode={lobbyMode} 
                targetSize={targetSize}
                setTargetSize={setTargetSize}
                gameDuration={gameDuration}
                setGameDuration={setGameDuration}
              onConnected={(p, nick) => {
                  setPlayersSafe([{ nick, score: 0, isLocal: true }])
                setError(null)
              }}
                onPlayersChanged={(nextPlayers) => {
                  if (playing) return
                  setPlayersSafe((prev) => {
                    const next = nextPlayers.map((pl, i) => ({ nick: pl.nick, score: prev[i]?.score ?? 0, isLocal: prev[i]?.isLocal ?? (i === 0) }))
                    return next
                  })
                }}
                onRemoteScore={(delta) => {
                  setPlayersSafe((prev) => {
                    if (prev.length < 2) return prev
                    const next = prev.map((p) => (!p.isLocal ? { ...p, score: (p.score ?? 0) + (delta || 0) } : p))
                    return next
                  })
                }}
                onRemoteEnd={() => {
                  if (!playing) return
                  handleEndGame()
                }}
              onError={(err) => {
                console.error('Lobby error:', err)
                setError(err.message || 'Failed to connect to lobby server')
                setLobbyMode(null)
              }}
              onStart={() => {
                  setLobbyMode(null)
                  setOverlayHidden(true)
                  setIsPracticeRun(false)
                  setUseTimerThisRun(true)
                  try { window.dispatchEvent(new Event('aim:resetCamera')) } catch {}
                  try { document.exitPointerLock && document.exitPointerLock() } catch {}
                  let c = 3
                  setPreStart(c)
                  const id = setInterval(() => {
                    c -= 1
                    setPreStart(c)
                    if (c <= 0) {
                      clearInterval(id)
                      setPreStart(null)
                setPlaying(true)
                      try { window.dispatchEvent(new Event('aim:start')) } catch {}
                    }
                  }, 1000)
              }}
            />
          )}

          </div>
        </div>
      )}
      <Scoreboard players={players} timer={timeLeft} />
      {(!showSettings && !lobbyMode && !showPractice && !playing && !error) && (
        <div className="menu-hint">Press Esc to toggle menu</div>
      )}
      {preStart !== null && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 25000, background: 'rgba(0,0,0,0.4)' }}>
          <div style={{ background: '#101820', color: 'white', padding: 16, borderRadius: 8, minWidth: 160, textAlign: 'center', fontSize: 24, fontWeight: 700 }}>
            {preStart}
          </div>
        </div>
      )}
      {practicePaused && isPracticeRun && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 26000, background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ background: '#101820', color: 'white', padding: 16, borderRadius: 8, minWidth: 320, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Practice Paused</div>
            {!practiceShowSettings ? (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="menu-btn" onClick={() => setPracticeShowSettings(true)}>Settings</button>
                <button className="menu-btn" onClick={() => { setPracticePaused(false); try { window.__aimTrainer = window.__aimTrainer || {}; window.__aimTrainer.paused = false } catch {}; try { document.body.requestPointerLock && document.body.requestPointerLock() } catch {} }}>Resume</button>
                <button className="menu-btn" onClick={() => { setPracticePaused(false); setIsPracticeRun(false); setPlaying(false); setOverlayHidden(false); try { window.__aimTrainer = window.__aimTrainer || {}; window.__aimTrainer.paused = false } catch {}; try { window.dispatchEvent(new Event('aim:stop')) } catch {} }}>Exit</button>
              </div>
            ) : (
              <div className="settings-panel" style={{ textAlign: 'left' }}>
                <div className="sensitivity-control">
                  <label className="settings-label">Sensitivity:</label>
                  <div className="sensitivity-value"><strong>{sensitivity.toFixed(2)}</strong></div>
                  <button className="small-btn" onClick={() => setSensitivity((s) => Math.max(0.1, parseFloat((s - 0.01).toFixed(2))))}>−</button>
                  <button className="small-btn" onClick={() => setSensitivity((s) => Math.min(3.0, parseFloat((s + 0.01).toFixed(2))))}>+</button>
                </div>
                <input
                  className="settings-range"
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.01"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                />

                <div className="sensitivity-control" style={{ marginTop: 12 }}>
                  <label className="settings-label">FOV:</label>
                  <div className="sensitivity-value"><strong>{fov}</strong></div>
                  <input
                    className="settings-range"
                    type="range"
                    min="60"
                    max="110"
                    step="1"
                    value={fov}
                    onChange={(e) => setFov(parseInt(e.target.value))}
                  />
                </div>

                <div className="sensitivity-control" style={{ marginTop: 12 }}>
                  <label className="settings-label">Crosshair Size: {crosshair.size}</label>
                  <input className="settings-range" type="range" min="6" max="60" step="1" value={crosshair.size} onChange={(e) => setCrosshair({ ...crosshair, size: parseInt(e.target.value) })} />
                  <label className="settings-label">Thickness: {crosshair.thickness}</label>
                  <input className="settings-range" type="range" min="1" max="8" step="0.5" value={crosshair.thickness} onChange={(e) => setCrosshair({ ...crosshair, thickness: parseFloat(e.target.value) })} />
                  <label className="settings-label">Gap: {crosshair.gap}</label>
                  <input className="settings-range" type="range" min="0" max="20" step="1" value={crosshair.gap} onChange={(e) => setCrosshair({ ...crosshair, gap: parseInt(e.target.value) })} />
                  <label className="settings-label">Show Dot:</label>
                  <input type="checkbox" checked={!!crosshair.showDot} onChange={(e) => setCrosshair({ ...crosshair, showDot: e.target.checked })} />
                  <label className="settings-label">Color:</label>
                  <input type="color" value={crosshair.color} onChange={(e) => setCrosshair({ ...crosshair, color: e.target.value })} style={{ marginLeft: 6 }} />
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="menu-btn" onClick={() => setPracticeShowSettings(false)}>Back</button>
                  <button className="menu-btn" onClick={() => { setPracticeShowSettings(false); setPracticePaused(false); try { window.__aimTrainer = window.__aimTrainer || {}; window.__aimTrainer.paused = false } catch {}; try { document.body.requestPointerLock && document.body.requestPointerLock() } catch {} }}>Resume</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {results && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30000, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ background: '#101820', color: 'white', padding: 16, borderRadius: 8, minWidth: 280, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Time's up</div>
            {results.practice ? (
              <div style={{ marginBottom: 12, fontSize: 16 }}>
                Score: <strong>{results.score}</strong>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  {results.winner === 'Tie' ? 'It\'s a tie!' : `${results.winner} wins!`}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                  {results.scores.map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 10px', borderRadius: 6 }}>
                      <div style={{ fontWeight: 600 }}>{s.nick}</div>
                      <div style={{ opacity: 0.9 }}>{s.score}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button className="menu-btn" onClick={() => { setResults(null); setPlaying(false); setOverlayHidden(false); setPlayers([]); setLobbyMode(null); }}>Close</button>
        </div>
      </div>
      )}
    </>
  )
}

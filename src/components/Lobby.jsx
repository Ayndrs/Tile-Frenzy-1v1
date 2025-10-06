import React, { useState, useRef, useEffect } from 'react'
import SimplePeer from 'simple-peer/simplepeer.min.js'
import { io as ioClient } from 'socket.io-client'
import '../styles/Lobby.css'

export default function Lobby({ mode = 'create', socketUrl: socketUrlProp, onConnected, onError = () => {}, onStart = () => {}, onPlayersChanged = () => {}, onRemoteScore = () => {}, onRemoteEnd = () => {}, targetSize, setTargetSize = () => {}, gameDuration = 30, setGameDuration = () => {} }) {
  const [nick, setNick] = useState('Player')
  const [code, setCode] = useState('')
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState('idle')
  const ws = useRef(null)
  const peer = useRef(null)
  const pendingSignals = useRef([])
  const lobbyCodeRef = useRef('')
  const role = useRef(null)
  const suppressDisconnectRef = useRef(false)
  const keepPeerRef = useRef(false)

  let socketUrl = socketUrlProp
  if (typeof socketUrl === 'undefined' && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const host = window.location.hostname || 'localhost'
    socketUrl = `${proto}//${host}:3000`
  }

  const notifyPlayers = (nextPlayers) => {
    try { onPlayersChanged && onPlayersChanged(nextPlayers) } catch (e) { console.error('onPlayersChanged handler error', e) }
  }

  const setPlayersSafe = (updater) => {
    setPlayers((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      notifyPlayers(next)
      return next
    })
  }

  useEffect(() => {
    const pending = ws.current?._pending || []
    const socket = ioClient(socketUrl)
    socket._pending = pending
    ws.current = socket

    socket.on('connect', () => {
      console.log('Lobby: socket connected', socket.id, 'pending=', socket._pending && socket._pending.length)
      if (socket._pending && socket._pending.length) setStatus('connecting')
      while (socket._pending && socket._pending.length) {
        const item = socket._pending.shift()
        try {
          console.log('Lobby: flushing pending event', item.event, item.data)
          if (item.event === 'create') {
            socket.emit('create', item.data, (res) => {
              if (res && res.code) {
                setCode(res.code)
                role.current = 'host'
                setPlayersSafe([{ nick, isLocal: true }])
                try { setGameDuration && setGameDuration(30) } catch (e) {}
                setStatus('in-lobby')
              } else {
                setStatus('idle')
              }
            })
          } else if (item.event === 'join') {
            socket.emit('join', item.data, (res) => {
              if (res && res.code) {
                setCode(res.code)
                role.current = 'client'
                startPeer(false)
                setPlayersSafe([{ nick, isLocal: true }])
                try { setGameDuration && setGameDuration(30) } catch (e) {}
                setStatus('in-lobby')
              } else {
                setStatus('idle')
              }
            })
          } else {
            socket.emit(item.event, item.data)
          }
        } catch (e) { console.error('flush pending failed', e) }
      }
    })

    socket.onAny((event, ...args) => {
      console.log('Lobby: socket event ->', event, args)
    })

    socket.on('created', (data) => {
      setCode(data.code)
      lobbyCodeRef.current = data.code
      console.log('Lobby: lobbyCodeRef set ->', lobbyCodeRef.current)
      role.current = 'host'
      setPlayersSafe([{ nick, isLocal: true }])
      try { setGameDuration && setGameDuration(30) } catch (e) {}
      setStatus('in-lobby')
    })

    socket.on('joined', (data) => {
      setCode(data.code)
      lobbyCodeRef.current = data.code
      console.log('Lobby: lobbyCodeRef set ->', lobbyCodeRef.current)
      role.current = 'client'
      startPeer(false)
      setPlayersSafe([{ nick, isLocal: true }])
      try { setGameDuration && setGameDuration(30) } catch (e) {}
      setStatus('in-lobby')
    })

    socket.on('peer-joined', () => {
      startPeer(true)
      setPlayersSafe((p) => {
        if (!p.length) return [{ nick, isLocal: true }, { nick: 'Connecting...', isLocal: false }]
        if (p.length >= 2) return p
        return [...p, { nick: 'Connecting...', isLocal: false }]
      })
    })

    socket.on('signal', (data) => {
      if (peer.current) {
        try { peer.current.signal(data.signal) } catch (e) { console.error('signal apply failed', e) }
      } else {
        pendingSignals.current = pendingSignals.current || []
        pendingSignals.current.push(data.signal)
        console.log('Lobby: buffered incoming signal, will apply when peer exists')
      }
    })

    socket.on('error', (err) => {
      console.error('Lobby socket error', err)
      onError(new Error(err && err.message ? err.message : 'Socket error'))
    })

    socket.on('disconnect', (reason) => {
      console.log('Lobby: socket disconnected', reason)
      if (suppressDisconnectRef.current) {
        console.log('Lobby: disconnect suppressed (expected during start/leave)')
        return
      }
      onError(new Error('Disconnected from signaling server'))
      setStatus('idle')
    })

    socket.on('start', () => {
      console.log('Lobby: received start from server')
      // prevent disconnect handlers from firing and keep peer alive across unmount
      suppressDisconnectRef.current = true
      keepPeerRef.current = true
      try { onStart && onStart() } catch (e) { console.error('onStart handler error', e) }
    })

    const cleanup = () => {
      if (!suppressDisconnectRef.current) {
        if (ws.current && ws.current.connected) {
          try {
            ws.current.emit('leave', { code })
          } catch (e) {}
        }
        if (ws.current) ws.current.close && ws.current.close()
      } else {
        console.log('Lobby cleanup: suppressing socket close (intentional)')
      }
      if (peer.current && !keepPeerRef.current) {
        try { peer.current.destroy() } catch (e) {}
      } else if (keepPeerRef.current) {
        console.log('Lobby cleanup: keeping peer alive across unmount')
      }
    }

    return () => cleanup()
  }, [socketUrl])

  const sendSignal = (signal) => {
    const lc = lobbyCodeRef.current || code
    if (!ws.current || !ws.current.connected) {
      ws.current = ws.current || { _pending: [] }
      ws.current._pending = ws.current._pending || []
      ws.current._pending.push({ event: 'signal', data: { code: lc, signal } })
      return
    }
    ws.current.emit('signal', { code: lc, signal })
  }

  const startPeer = (initiator) => {
    if (peer.current) {
      try { peer.current.destroy() } catch (e) {}
      peer.current = null
    }

  console.log('Lobby: startPeer initiator=', initiator)
  peer.current = new SimplePeer({ initiator, trickle: false })

    // apply any buffered incoming signals that arrived before peer was created
    if (pendingSignals.current && pendingSignals.current.length) {
      const signals = pendingSignals.current.slice()
      pendingSignals.current = []
      console.log('Lobby: applying', signals.length, 'buffered signals')
      signals.forEach(s => {
        try { peer.current.signal(s) } catch (e) { console.error('apply buffered signal failed', e) }
      })
    }

    peer.current.on('signal', (signal) => {
      if (ws.current && ws.current.connected) {
        const lc = lobbyCodeRef.current || code
        console.log('Lobby: emitting signal to server, code=', lc)
        ws.current.emit('signal', { code: lc, signal })
      } else {
        ws.current = ws.current || { _pending: [] }
        ws.current._pending = ws.current._pending || []
        ws.current._pending.push({ event: 'signal', data: { code: lobbyCodeRef.current || code, signal } })
      }
    })

    peer.current.on('connect', () => {
      console.log('peer connected')
      try {
        if (typeof window !== 'undefined') {
          window.__aimTrainer = window.__aimTrainer || {}
          window.__aimTrainer.peer = peer.current
        }
      } catch (e) {}
      try { peer.current.send(JSON.stringify({ type: 'nick', nick })) } catch (e) { console.error(e) }
      try { if (role.current === 'host' && typeof targetSize === 'number') peer.current.send(JSON.stringify({ type: 'targetSize', value: targetSize })) } catch (e) { console.error(e) }
      try { if (role.current === 'host') peer.current.send(JSON.stringify({ type: 'gameDuration', value: (typeof gameDuration === 'number' ? gameDuration : 30) })) } catch (e) { console.error(e) }
      onConnected && onConnected(peer.current, nick)
    })

    peer.current.on('data', (d) => {
      try {
        const data = JSON.parse(d.toString())
        if (data.type === 'nick') {
          console.log('peer nick:', data.nick)
          setPlayersSafe((prev) => {
            const local = prev.find(p => p.isLocal) || { nick, isLocal: true }
            const remote = { nick: data.nick, isLocal: false }
            return [local, remote]
          })
        } else if (data.type === 'start') {
          console.log('peer requested start')
          suppressDisconnectRef.current = true
          keepPeerRef.current = true
          try { onStart && onStart() } catch (e) { console.error('onStart handler error', e) }
        } else if (data.type === 'score') {
          try { onRemoteScore && onRemoteScore(data.delta || 0) } catch (e) { console.error('onRemoteScore handler error', e) }
        } else if (data.type === 'end') {
          console.log('peer requested end')
          try { onRemoteEnd && onRemoteEnd(data) } catch (e) { console.error('onRemoteEnd handler error', e) }
        } else if (data.type === 'targetSize') {
          if (role.current !== 'host' && typeof data.value === 'number') {
            try { setTargetSize(data.value) } catch (e) { console.error('setTargetSize handler error', e) }
          }
        } else if (data.type === 'gameDuration') {
          if (typeof data.value === 'number') {
            try { setGameDuration(data.value) } catch (e) { console.error('setGameDuration handler error', e) }
          }
        }
      } catch (e) { console.log('data', d.toString()) }
    })

    peer.current.on('error', (e) => {
      const message = (e && (e.reason || e.message)) || ''
      if (typeof message === 'string' && /User-Initiated Abort|Close called|OperationError/i.test(message)) {
        console.log('peer error ignored:', message)
        return
      }
      console.error('peer error', e)
    })
    peer.current.on('close', () => console.log('peer closed'))
  }

  const create = () => {
    console.log('Create lobby clicked; socket current:', ws.current && !!ws.current.connected)
    if (!ws.current || !ws.current.connected) {
      ws.current = ws.current || { _pending: [] }
      ws.current._pending = ws.current._pending || []
      ws.current._pending.push({ event: 'create', data: undefined })
      console.log('Lobby: queued create until socket connects')
      setStatus('connecting')
      return
    }
    ws.current.emit('create', undefined, (res) => {
      if (res && res.code) {
        setCode(res.code)
        role.current = 'host'
        setPlayers([{ nick, isLocal: true }])
        try { setGameDuration && setGameDuration(30) } catch (e) {}
        setStatus('in-lobby')
      } else {
        console.error('Create ack failed', res)
        setStatus('idle')
      }
    })
    ws.current.once('created', (data) => {
      if (data && data.code) {
        setCode(data.code)
        role.current = 'host'
        setPlayers([{ nick, isLocal: true }])
        setStatus('in-lobby')
      }
    })
    setStatus('connecting')
  }

  const join = () => {
    console.log('Join lobby clicked; socket current:', ws.current && !!ws.current.connected, 'code=', code)
    if (!ws.current || !ws.current.connected) {
      ws.current = ws.current || { _pending: [] }
      ws.current._pending = ws.current._pending || []
      ws.current._pending.push({ event: 'join', data: { code: lobbyCodeRef.current || code } })
      console.log('Lobby: queued join until socket connects')
      setStatus('connecting')
      return
    }
    ws.current.emit('join', { code }, (res) => {
      if (res && res.code) {
        setCode(res.code)
        role.current = 'client'
        startPeer(false)
        setPlayers([{ nick, isLocal: true }])
        setStatus('in-lobby')
      } else {
        console.error('Join ack failed', res)
        setStatus('idle')
        onError(new Error(res && res.error ? res.error : 'Join failed'))
      }
    })
    ws.current.once('joined', (data) => {
      if (data && data.code) {
        setCode(data.code)
        role.current = 'client'
        startPeer(false)
        setPlayers([{ nick, isLocal: true }])
        setStatus('in-lobby')
      }
    })
    setStatus('connecting')
  }

  return (
    <div style={{ padding: 8, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 24 }}>
      <div>
        <label>Nickname: </label>
        <input value={nick} onChange={(e) => setNick(e.target.value)} />
      </div>

      <div style={{ marginTop: 8 }}>
        {mode === 'create' ? (
          <button onClick={create} disabled={status !== 'idle'}>{status === 'connecting' ? 'Connecting...' : 'Create Lobby'}</button>
        ) : (
          <>
            <input placeholder="Lobby code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button onClick={join} disabled={status !== 'idle' || !code}>{status === 'connecting' ? 'Connecting...' : 'Join Lobby'}</button>
          </>
        )}
      </div>

      {status !== 'idle' && <div style={{ marginTop: 8, opacity: 0.9 }}>Status: {status}</div>}

          {code && (
        <div style={{ marginTop: 12 }}>
          {role.current === 'host' && (
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Lobby Code: {code}</span>
              <button
                onClick={() => {
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(code)
                    } else {
                      const ta = document.createElement('textarea')
                      ta.value = code
                      document.body.appendChild(ta)
                      ta.select()
                      document.execCommand('copy')
                      document.body.removeChild(ta)
                    }
                  } catch (e) { console.error('copy failed', e) }
                }}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >Copy</button>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600 }}>Players:</div>
            <ul>
              {players.map((p, i) => (
                <li key={i} style={{ opacity: p.isLocal ? 1 : 0.9 }}>{p.nick}{p.isLocal ? ' (you)' : ''}</li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={{ marginRight: 8, opacity: role.current === 'host' && players.length >= 2 ? 1 : 0.6 }}>Timer (s):</label>
            <input
              type="range"
              min={10}
              max={180}
              step={5}
              value={gameDuration}
              disabled={role.current !== 'host' || players.length < 2}
              onChange={(e) => {
                const val = parseInt(e.target.value)
                try { setGameDuration(val) } catch {}
                if (role.current === 'host' && peer.current && peer.current.connected) {
                  try { peer.current.send(JSON.stringify({ type: 'gameDuration', value: val })) } catch {}
                }
              }}
            />
            <span style={{ marginLeft: 8 }}>{gameDuration}s</span>
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={{ marginRight: 8, opacity: role.current === 'host' && players.length >= 2 ? 1 : 0.6 }}>Target Size:</label>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={targetSize}
              disabled={role.current !== 'host' || players.length < 2}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                try { setTargetSize(val) } catch {}
                if (role.current === 'host' && peer.current && peer.current.connected) {
                  try { peer.current.send(JSON.stringify({ type: 'targetSize', value: val })) } catch {}
                }
              }}
            />
            <span style={{ marginLeft: 8 }}>{targetSize.toFixed(1)}</span>
          </div>

          {role.current === 'host' && players.length >= 1 && (
            <div style={{ marginTop: 8 }}>
              <button disabled={players.length < 2} onClick={() => {
                suppressDisconnectRef.current = true
                keepPeerRef.current = true
                try {
                  if (typeof window !== 'undefined') {
                    window.__aimTrainer = window.__aimTrainer || {}
                    window.__aimTrainer.socket = ws.current
                    window.__aimTrainer.peer = peer.current
                  }
                } catch (e) {}

                if (players.length < 2) return
                if (peer.current && peer.current.connected) {
                  try { peer.current.send(JSON.stringify({ type: 'start' })) } catch (e) { console.error('peer send start failed', e) }
                }
                try {
                  const lc = lobbyCodeRef.current || code
                  if (ws.current && ws.current.connected) ws.current.emit('start', { code: lc })
                } catch (e) { console.error('socket emit start failed', e) }
                try { onStart && onStart() } catch (e) { console.error('onStart handler error', e) }
              }}>Start Game</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

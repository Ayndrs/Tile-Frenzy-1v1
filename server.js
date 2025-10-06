import http from 'http'
import { Server as IOServer } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Signaling server running — Socket.IO endpoint: http://' + (req.headers.host || 'localhost:3000'))
    return
  }
  res.writeHead(404)
  res.end()
})

const io = new IOServer(server, {
  cors: { origin: '*' }
})

const lobbies = new Map()

io.on('connection', (socket) => {
  console.log('New Socket.IO connection', socket.id, socket.handshake.address)

  socket.on('create', (arg, ack) => {
    const code = uuidv4().slice(0, 6)
    lobbies.set(code, { host: socket, clients: [] })
    socket.data.lobby = code
    socket.data.role = 'host'
    console.log('Server: create ->', socket.id, 'code=', code)
    socket.emit('created', { code })
    if (typeof ack === 'function') try { ack({ code }) } catch (e) {}
  })

  socket.on('join', ({ code } = {}, ack) => {
    const lobby = lobbies.get(code)
    if (!lobby) {
      console.log('Server: join failed - lobby not found', socket.id, 'code=', code)
      socket.emit('error', { message: 'Lobby not found' })
      if (typeof ack === 'function') try { ack({ error: 'Lobby not found' }) } catch (e) {}
      return
    }
    if (lobby.clients.length >= 1) {
      console.log('Server: join failed - lobby full', socket.id, 'code=', code)
      socket.emit('error', { message: 'Lobby full' })
      if (typeof ack === 'function') try { ack({ error: 'Lobby full' }) } catch (e) {}
      return
    }
    lobby.clients.push(socket)
    socket.data.lobby = code
    socket.data.role = 'client'
    console.log('Server: join ->', socket.id, 'code=', code, 'notifying host:', lobby.host && lobby.host.id)
    if (lobby.host) lobby.host.emit('peer-joined')
    socket.emit('joined', { code })
    if (typeof ack === 'function') try { ack({ code }) } catch (e) {}
  })

  socket.on('signal', ({ code, signal }) => {
    const lobby = lobbies.get(code)
    if (!lobby) {
      console.log('Server: signal for unknown lobby', code)
      return
    }
    let target = null
    if (socket === lobby.host) {
      target = lobby.clients[0]
    } else {
      target = lobby.host
    }
    console.log('Server: signal from', socket.id, 'to', target && target.id, 'lobby=', code)
    if (target) target.emit('signal', { signal })
  })

  socket.on('start', ({ code }) => {
    const lobby = lobbies.get(code)
    if (!lobby) return
    let target = null
    if (socket === lobby.host) target = lobby.clients[0]
    else target = lobby.host
    console.log('Server: start from', socket.id, 'to', target && target.id, 'lobby=', code)
    if (target) target.emit('start')
  })

  socket.on('leave', ({ code }) => {
    console.log('Server: leave from', socket.id, 'lobby=', code)
    const lobby = lobbies.get(code)
    if (!lobby) return
    if (socket === lobby.host) {
      lobby.clients.forEach(c => c.emit('closed'))
      lobbies.delete(code)
    } else {
      lobby.clients = lobby.clients.filter(c => c !== socket)
      if (lobby.host) lobby.host.emit('peer-left')
    }
  })

  socket.on('disconnect', (reason) => {
    console.log('Server: disconnect', socket.id, 'reason=', reason)
    const code = socket.data.lobby
    if (!code) return
    const lobby = lobbies.get(code)
    if (!lobby) return
    if (socket === lobby.host) {
      console.log('Server: host disconnected, closing lobby', code)
      lobby.clients.forEach(c => c.emit('closed'))
      lobbies.delete(code)
    } else {
      console.log('Server: client disconnected from lobby', code, socket.id)
      lobby.clients = lobby.clients.filter(c => c !== socket)
      if (lobby.host) lobby.host.emit('peer-left')
    }
  })
})

server.listen(3000, () => console.log('Signaling server listening on http://localhost:3000 (Socket.IO)'))

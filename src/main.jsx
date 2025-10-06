import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

if (typeof globalThis.global === 'undefined') {
  globalThis.global = globalThis
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
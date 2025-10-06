import React from 'react'
import '../styles/scoreboard.css'

export default function Scoreboard({ players = [], timer = null }) {
  return (
    <div className="scoreboard">
      <div className="score-layout">
        {players.map((p, i) => (
          <div key={i} className="score-entry">
            <div className="score-name">{p.nick}</div>
            <div className="score-score">{p.score ?? 0}</div>
          </div>
        ))}
      </div>
      {typeof timer === 'number' && (
        <div className="score-entry" style={{ minWidth: 64, textAlign: 'center', fontWeight: 700 }}>
          {Math.max(0, Math.ceil(timer))}
        </div>
      )}
    </div>
  )
}

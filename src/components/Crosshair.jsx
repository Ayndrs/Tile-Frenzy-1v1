import React from 'react'
import '../styles/styles.css'

export default function Crosshair({ size = 20, thickness = 1.5, gap = 4, color = '#00ff00', showDot = true }) {
  const half = size / 2
  const styleVars = {
    ['--cross-size']: `${size}px`,
    ['--cross-half']: `${half}px`,
    ['--cross-thickness']: `${thickness}px`,
    ['--cross-gap']: `${gap}px`,
    ['--cross-color']: color,
  }

  return (
    <div className="crosshair" style={styleVars} aria-hidden="true">
      <div className="ch ch-top" />
      <div className="ch ch-right" />
      <div className="ch ch-bottom" />
      <div className="ch ch-left" />
      {showDot && <div className="ch-dot" />}
    </div>
  )
}

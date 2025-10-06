import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'

import Experience from './Experience.jsx'
import Crosshair from './components/Crosshair.jsx'
import GameMenu from './components/GameMenu.jsx'

import './styles/styles.css'
import './styles/menu.css'
import { useState } from 'react'

export default function App() {
  const [sensitivity, setSensitivity] = useState(1.0)
  const [fov, setFov] = useState(75)
  const [crosshair, setCrosshair] = useState({ size: 20, thickness: 1.5, gap: 4, color: '#00ff00', showDot: true })
  const [targetSize, setTargetSize] = useState(1.5)
  const [gameDuration, setGameDuration] = useState(30)

  return (
    <>
      <Canvas shadows>
        <Suspense fallback={null}>
          <Experience sensitivity={sensitivity} fov={fov} targetSize={targetSize} />
        </Suspense>
      </Canvas>
      <Crosshair {...crosshair} />
      <GameMenu
        sensitivity={sensitivity}
        setSensitivity={setSensitivity}
        fov={fov}
        setFov={setFov}
        crosshair={crosshair}
        setCrosshair={setCrosshair}
        targetSize={targetSize}
        setTargetSize={setTargetSize}
        gameDuration={gameDuration}
        setGameDuration={setGameDuration}
      />
    </>
  )
}
import { useThree } from '@react-three/fiber'
import { PointerLockControls, Environment, Text, Float } from '@react-three/drei'
import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'

export default function Experience({ sensitivity = 1.0, fov = 75, targetSize }) {
    const { camera } = useThree()
    const [playing, setPlaying] = useState(false)
    const [targets, setTargets] = useState([])
    const meshesRef = useRef([])
    const raycasterRef = useRef(new THREE.Raycaster())
    const tmpDirRef = useRef(new THREE.Vector3())
    const roomBoundsRef = useRef({ halfW: 8, halfD: 8, height: 12 })
    const hitAudioRef = useRef(null)
    const targetSizeRef = useRef(targetSize)
    useEffect(() => {
        if (camera.position.y < 0.5) {
            camera.position.set(0, 6, -6)
            camera.lookAt(0, 6, 1)
        }
    }, [camera])

    // Reset camera position when game starts
    useEffect(() => {
        const onResetCam = () => {
            camera.position.set(0, 6, -6)
            camera.lookAt(0, 6, 1)
            // Reset any rotation that might cause flicking
            camera.rotation.set(0, 0, 0)
        }
        
        window.addEventListener('aim:resetCamera', onResetCam)
        return () => window.removeEventListener('aim:resetCamera', onResetCam)
    }, [camera])

    // Handle pointer lock state for cursor visibility
    useEffect(() => {
        const handlePointerLockChange = () => {
            if (document.pointerLockElement) {
                document.body.classList.add('pointer-locked')
            } else {
                document.body.classList.remove('pointer-locked')
            }
        }

        document.addEventListener('pointerlockchange', handlePointerLockChange)
        return () => document.removeEventListener('pointerlockchange', handlePointerLockChange)
    }, [])

    useEffect(() => {
        try { camera.fov = fov; camera.updateProjectionMatrix() } catch {}
    }, [camera, fov])
    useEffect(() => { targetSizeRef.current = targetSize }, [targetSize])
    useEffect(() => {
        try {
            hitAudioRef.current = new Audio('/dink.wav')
            hitAudioRef.current.volume = 0.5
        } catch {}
    }, [])
    useEffect(() => {
        const onStart = () => {
            setPlaying(true)
            setTargets([])
            requestAnimationFrame(() => {
                meshesRef.current = []
                setTargets(generateTargets(3, roomBoundsRef.current))
            })
        }
        const onResetCam = () => {
            camera.position.set(0, 6, -6)
            camera.lookAt(0, 6, 1)
        }
        const onStop = () => {
            setPlaying(false)
            setTargets([])
        }
        window.addEventListener('aim:start', onStart)
        window.addEventListener('aim:resetCamera', onResetCam)
        window.addEventListener('aim:stop', onStop)
        return () => {
            window.removeEventListener('aim:start', onStart)
            window.removeEventListener('aim:resetCamera', onResetCam)
            window.removeEventListener('aim:stop', onStop)
        }
    }, [])

    useEffect(() => {
        if (!playing) return
        setTargets((prev) => {
            if (!prev || prev.length === 0) {
                return generateTargets(3, roomBoundsRef.current)
            }
            const z = roomBoundsRef.current.halfD - targetSize / 2 - 0.01
            return prev.map((t) => ({ ...t, size: targetSize, position: [t.position[0], t.position[1], z] }))
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetSize, playing])

    useEffect(() => {
        const onMouseDown = (e) => {
            if (!playing) return
            try { if (window.__aimTrainer && window.__aimTrainer.paused) return } catch {}
            if (e.button !== 0) return
            if (!meshesRef.current.length) return
            const raycaster = raycasterRef.current
            const dir = tmpDirRef.current
            camera.getWorldDirection(dir)
            raycaster.set(camera.position, dir)
            const intersects = raycaster.intersectObjects(meshesRef.current, false)
            if (intersects && intersects.length > 0) {
                const hit = intersects[0]
                const idx = meshesRef.current.indexOf(hit.object)
                if (idx >= 0) {
                    setTargets((prev) => {
                        const next = prev.slice()
                        const others = next.filter((_, i) => i !== idx)
                        next[idx] = randomNonOverlapping(others, roomBoundsRef.current)
                        return next
                    })
                    try {
                        try {
                            const a = hitAudioRef.current
                            if (a) { a.currentTime = 0; a.play().catch(() => {}) }
                        } catch {}
                        window.dispatchEvent(new CustomEvent('aim:hit', { detail: { points: 1 } }))
                    } catch {}
                }
            } else {
                try {
                    window.dispatchEvent(new CustomEvent('aim:miss', { detail: { points: -1 } }))
                } catch {}
            }
        }
        window.addEventListener('mousedown', onMouseDown)
        return () => window.removeEventListener('mousedown', onMouseDown)
    }, [playing, camera])

    const generateTargets = (count, bounds) => {
        const arr = []
        for (let i = 0; i < count; i++) {
            arr.push(randomNonOverlapping(arr, bounds))
        }
        return arr
    }

    const randomTarget = (bounds) => {
        const size = targetSizeRef.current
        const x = THREE.MathUtils.randFloat(-bounds.halfW * 0.8, bounds.halfW * 0.8)
        const y = THREE.MathUtils.randFloat(1, 11)
        const z = bounds.halfD - size / 2 - 0.01
        const color = new THREE.Color().setHSL(Math.random(), 0.6, 0.5).getStyle()
        return { position: [x, y, z], size, color }
    }

    const overlapsXY = (a, b, padding = 0.1) => {
        const ax = a.position[0], ay = a.position[1]
        const bx = b.position[0], by = b.position[1]
        const minSep = (a.size + b.size) / 2 + padding
        return Math.abs(ax - bx) < minSep && Math.abs(ay - by) < minSep
    }

    const randomNonOverlapping = (existing, bounds, maxAttempts = 100) => {
        let candidate = null
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const t = randomTarget(bounds)
            let ok = true
            for (let i = 0; i < existing.length; i++) {
                if (overlapsXY(t, existing[i])) { ok = false; break }
            }
            if (ok) { candidate = t; break }
        }
        return candidate || randomTarget(bounds)
    }

    return (
        <>
            <color attach="background" args={["#0057b8"]} />

            {!playing && (
                <>
                    <Float
                        speed={5}
                        rotationIntensity={0.1} 
                        floatIntensity={1} 
                        floatingRange={[-0.5, 0.5]} 
                    >
                        <Text
                            position={[0, 7, -2]}
                            rotation={[0, Math.PI, 0]}
                            font={"./Poppins-Medium.ttf"}
                            fontSize={0.75}
                            color="#ffffff"
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.02}
                            outlineColor="#000000"
                        >
                            Tile Frenzy 1v1
                        </Text>
                    </Float>
                    <mesh
                        position={[-2, 1, 5]}
                    >
                        <boxGeometry 
                            args={[2, 2, 2]}
                        />
                        <meshStandardMaterial color="hotpink" />
                    </mesh>
                    <mesh
                        position={[2, 1, 5]}
                    >
                        <boxGeometry 
                            args={[2, 2, 2]}
                        />
                        <meshStandardMaterial color="orange" />
                    </mesh>
                </>
            )}

            {playing && (
                <group>
                    {targets.map((t, i) => (
                        <mesh
                            key={`${i}-${t.size}`}
                            ref={(el) => (meshesRef.current[i] = el)}
                            position={t.position}
                            castShadow
                        >
                            <boxGeometry key={`geo-${i}-${t.size}`} args={[t.size, t.size, t.size]} />
                            <meshStandardMaterial color={t.color} />
                        </mesh>
                    ))}
                </group>
            )}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#447488" metalness={0} roughness={0.9} />
            </mesh>

            <gridHelper args={[100, 100, '#b9b9b9', '#b9b9b9']} position={[0, 0.01, 0]} />

            {(() => {
                const roomW = 16
                const roomD = 16
                const roomH = 12
                const hw = roomW / 2
                const hd = roomD / 2
                const wallColor = '#447488'

                return (
                    <>
                        <mesh position={[0, roomH / 2, -hd]}>
                            <planeGeometry args={[roomW, roomH]} />
                            <meshStandardMaterial color={wallColor} metalness={0} roughness={0.9} />
                        </mesh>
                        <gridHelper args={[roomW, roomW, '#888888', '#888888']} rotation={[Math.PI / 2, 0, 0]} position={[0, roomH / 2, -hd + 0.01]} />

                        <mesh position={[0, roomH / 2, hd]} rotation={[0, Math.PI, 0]}>
                            <planeGeometry args={[roomW, roomH]} />
                            <meshStandardMaterial color={wallColor} metalness={0} roughness={0.9} />
                        </mesh>
                        <gridHelper args={[roomW, roomW, '#888888', '#888888']} rotation={[Math.PI / 2, 0, 0]} position={[0, roomH / 2, hd - 0.01]} />

                        <mesh position={[-hw, roomH / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
                            <planeGeometry args={[roomD, roomH]} />
                            <meshStandardMaterial color={wallColor} metalness={0} roughness={0.9} />
                        </mesh>
                        <gridHelper args={[roomD, roomD, '#888888', '#888888']} rotation={[Math.PI / 2, 0, Math.PI / 2]} position={[-hw + 0.01, roomH / 2, 0]} />

                        <mesh position={[hw, roomH / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
                            <planeGeometry args={[roomD, roomH]} />
                            <meshStandardMaterial color={wallColor} metalness={0} roughness={0.9} />
                        </mesh>
                        <gridHelper args={[roomD, roomD, '#888888', '#888888']} rotation={[Math.PI / 2, 0, -Math.PI / 2]} position={[hw - 0.01, roomH / 2, 0]} />

                        <mesh position={[0, roomH, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[roomW, roomD]} />
                            <meshStandardMaterial color={wallColor} metalness={0} roughness={0.9} />
                        </mesh>
                    </>
                )
            })()}

            <Environment preset="city" />
            <PointerLockControls 
                pointerSpeed={sensitivity} 
                makeDefault
            />
        </>
    )
}
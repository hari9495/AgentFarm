"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

function CartoonAgent({ compactMotion }: { compactMotion: boolean }) {
    const groupRef = useRef<Group>(null);
    const leftEyeRef = useRef<Mesh>(null);
    const rightEyeRef = useRef<Mesh>(null);

    useFrame((state) => {
        if (!groupRef.current) {
            return;
        }

        if (compactMotion) {
            return;
        }

        const t = state.clock.elapsedTime;
        const bob = Math.sin(t * 1.8) * 0.08;
        const sway = Math.sin(t * 0.8) * 0.18;
        const blink = Math.sin(t * 2.6) > 0.985 ? 0.14 : 1;

        groupRef.current.position.y = bob;
        groupRef.current.rotation.y = sway;

        if (leftEyeRef.current && rightEyeRef.current) {
            leftEyeRef.current.scale.y = blink;
            rightEyeRef.current.scale.y = blink;
        }
    });

    return (
        <group ref={groupRef} position={[0, -0.12, 0]}>
            {/* Body */}
            <mesh position={[0, -0.55, 0]}>
                <capsuleGeometry args={[0.48, 0.9, 8, 16]} />
                <meshStandardMaterial color="#0284c7" roughness={0.4} metalness={0.08} />
            </mesh>

            {/* Head */}
            <mesh position={[0, 0.52, 0]}>
                <sphereGeometry args={[0.48, 28, 28]} />
                <meshStandardMaterial color="#fed7aa" roughness={0.62} metalness={0.02} />
            </mesh>

            {/* Hair cap */}
            <mesh position={[0, 0.76, -0.03]} rotation={[0.28, 0, 0]}>
                <sphereGeometry args={[0.42, 24, 24, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
                <meshStandardMaterial color="#0f172a" roughness={0.48} metalness={0.04} />
            </mesh>

            {/* Eyes */}
            <mesh position={[-0.16, 0.56, 0.38]} ref={leftEyeRef}>
                <sphereGeometry args={[0.052, 16, 16]} />
                <meshStandardMaterial color="#111827" roughness={0.3} />
            </mesh>
            <mesh position={[0.16, 0.56, 0.38]} ref={rightEyeRef}>
                <sphereGeometry args={[0.052, 16, 16]} />
                <meshStandardMaterial color="#111827" roughness={0.3} />
            </mesh>

            {/* Smile */}
            <mesh position={[0, 0.38, 0.39]} rotation={[0, 0, Math.PI]}>
                <torusGeometry args={[0.11, 0.015, 10, 24, Math.PI]} />
                <meshStandardMaterial color="#be123c" roughness={0.32} />
            </mesh>

            {/* Arms */}
            <mesh position={[-0.56, -0.45, 0]} rotation={[0, 0, 0.48]}>
                <capsuleGeometry args={[0.1, 0.48, 6, 12]} />
                <meshStandardMaterial color="#0ea5e9" roughness={0.35} metalness={0.08} />
            </mesh>
            <mesh position={[0.56, -0.45, 0]} rotation={[0, 0, -0.48]}>
                <capsuleGeometry args={[0.1, 0.48, 6, 12]} />
                <meshStandardMaterial color="#0ea5e9" roughness={0.35} metalness={0.08} />
            </mesh>

            {/* Tiny laptop */}
            <mesh position={[0, -0.25, 0.44]} rotation={[-0.35, 0, 0]}>
                <boxGeometry args={[0.48, 0.28, 0.04]} />
                <meshStandardMaterial color="#334155" roughness={0.36} metalness={0.25} />
            </mesh>
            <mesh position={[0, -0.2, 0.58]} rotation={[0.35, 0, 0]}>
                <boxGeometry args={[0.48, 0.26, 0.03]} />
                <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.15} />
            </mesh>

            {/* Floating badges */}
            <mesh position={[-1.12, 0.86, -0.3]}>
                <boxGeometry args={[0.44, 0.2, 0.08]} />
                <meshStandardMaterial color="#22c55e" roughness={0.42} metalness={0.05} />
            </mesh>
            <mesh position={[1.1, 0.22, -0.35]}>
                <boxGeometry args={[0.52, 0.2, 0.08]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.42} metalness={0.05} />
            </mesh>
        </group>
    );
}

export default function HeroScene3DCanvas({ compactMotion }: { compactMotion: boolean }) {
    return (
        <div className="h-[320px] sm:h-[380px] bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800">
            <Canvas camera={{ position: [0, 0.16, 4.2], fov: 43 }} dpr={[1, 1.4]} gl={{ antialias: false }}>
                <color attach="background" args={["#ecfeff"]} />
                <hemisphereLight intensity={0.75} color="#f0f9ff" groundColor="#0f172a" />
                <directionalLight position={[2.6, 2.2, 2.8]} intensity={1.15} color="#c7f9ff" />
                <directionalLight position={[-2.2, -1.8, 1.2]} intensity={0.35} color="#bae6fd" />

                {/* Ground */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]}>
                    <circleGeometry args={[1.95, 64]} />
                    <meshBasicMaterial color="#bae6fd" transparent opacity={0.35} />
                </mesh>

                <CartoonAgent compactMotion={compactMotion} />
            </Canvas>
        </div>
    );
}
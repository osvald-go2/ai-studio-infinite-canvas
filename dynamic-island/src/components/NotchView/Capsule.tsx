import { motion } from 'motion/react'

interface CapsuleProps {
  visible: boolean
  connected: boolean
}

export function Capsule({ visible, connected }: CapsuleProps) {
  return (
    <motion.div
      className="absolute left-1/2 top-0 -translate-x-1/2"
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        width: visible ? 160 : 140,
        height: visible ? 30 : 0
      }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
    >
      <div
        className="w-full h-full rounded-b-xl"
        style={{
          backgroundColor: connected ? '#000' : '#1a1a1a',
          opacity: connected ? 1 : 0.5
        }}
      />
    </motion.div>
  )
}

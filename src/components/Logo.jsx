import { useState } from 'react'
import logoSrc from '../assets/brand-logo.svg'
import logoIconSrc from '../assets/brand-mark.svg'

export default function Logo({ variant = 'full', height = 28, style = {} }) {
  const [failed, setFailed] = useState(false)
  const src = variant === 'icon' ? logoIconSrc : logoSrc

  if (failed) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--color-primary)',
        fontFamily: 'var(--font-display)',
        fontSize: height,
        fontWeight: 800,
        lineHeight: 1,
        ...style,
      }}>
        EduFlow
      </span>
    )
  }

  return (
    <img
      src={src}
      alt="EduFlow"
      height={height}
      onError={() => setFailed(true)}
      style={{ display: 'block', maxWidth: 170, objectFit: 'contain', ...style }}
    />
  )
}

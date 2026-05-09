import React from 'react'
import { NavLink, type NavLinkProps } from 'react-router-dom'

/** Springy hover + radial glow follows cursor (CSS vars --mx --my). */
export default function NavOrbitLink(props: NavLinkProps) {
  const { className, onMouseMove, ...rest } = props
  const ref = React.useRef<HTMLAnchorElement>(null)

  const handleMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onMouseMove?.(e)
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const mx = ((e.clientX - r.left) / r.width) * 100
    const my = ((e.clientY - r.top) / r.height) * 100
    el.style.setProperty('--mx', `${mx}%`)
    el.style.setProperty('--my', `${my}%`)
  }

  return (
    <NavLink
      ref={ref}
      {...rest}
      onMouseMove={handleMove}
      className={(state) => {
        const extra = typeof className === 'function' ? className(state) : className
        return ['nav-orbit-link', state.isActive ? 'is-active' : '', extra].filter(Boolean).join(' ')
      }}
    />
  )
}

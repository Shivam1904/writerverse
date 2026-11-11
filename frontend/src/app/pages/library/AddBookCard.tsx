import { Plus } from 'lucide-react'
import { LIBRARY } from '../../../config/library'

/** Dashed "start a new book" slot on the shelf — with a matching reflection. */
export function AddBookCard({
  onClick,
  enlarged,
  label,
}: {
  onClick: () => void
  enlarged?: boolean
  label?: string
}) {
  const w = enlarged ? 200 : 150
  const h = enlarged ? 282 : 212

  const inner = (
    <>
      <Plus className="wv2-lib-add-icon" />
      <span className="wv2-lib-add-label">{label ?? LIBRARY.newBook}</span>
    </>
  )

  return (
    <div className="wv2-lib-slot" style={{ ['--bw' as any]: `${w}px`, ['--bh' as any]: `${h}px` }}>
      <button type="button" className="wv2-lib-add" onClick={onClick}>
        {inner}
      </button>
      <div className="wv2-lib-add wv2-lib-cover-reflection" aria-hidden>
        {inner}
      </div>
    </div>
  )
}

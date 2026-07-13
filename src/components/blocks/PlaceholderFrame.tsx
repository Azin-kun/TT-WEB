// Neutral placeholder card for work covers until real imagery (H4) arrives
// (spec §6.4): paper card with a watermark logo in Atelier, carbon panel with
// a signal-red edge glow in Obsidian. Both appearances driven by tokens only.
export function PlaceholderFrame({
  aspectRatio = '3 / 2',
  label,
}: {
  aspectRatio?: string
  label?: string
}) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio,
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <span
        aria-hidden
        className="tt-logo"
        style={{ width: '22%', aspectRatio: '1532 / 1427', opacity: 0.14 }}
      />
      {label ? (
        <span
          style={{
            position: 'absolute',
            bottom: 12,
            left: 14,
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}

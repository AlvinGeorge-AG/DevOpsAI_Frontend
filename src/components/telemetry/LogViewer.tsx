interface LogEntryObject {
  time?: string
  action?: string
  reason?: string
  status?: string
  [key: string]: unknown
}

interface LogViewerProps {
  logs?: (string | LogEntryObject)[]
}

export function LogViewer({ logs = [] }: LogViewerProps) {
  // Guarantee we are iterating over an array even if the backend passes null/undefined
  const safeLogs = Array.isArray(logs) ? logs : []

  return (
    <div className="log-viewer">
      <div className="telemetry-panel__section-header">
        <h3>Logs Viewer</h3>
        <p>Latest cluster audit events</p>
      </div>
      <div className="log-viewer__list">
        {safeLogs.map((entry, index) => {
          let time = '[now]'
          let message = ''

          // SCENARIO 1: Rohan's original plain text string format
          if (typeof entry === 'string') {
            const closing = entry.indexOf(']')
            time = closing > 0 ? entry.slice(0, closing + 1) : '[now]'
            message = closing > 0 ? entry.slice(closing + 2) : entry
          }
          // SCENARIO 2: Our rich Python SQLite dictionary format
          else if (entry && typeof entry === 'object') {
            time = `[${entry.time ?? 'now'}]`
            const statusBadge = entry.status ? `[${entry.status}] ` : ''
            const actionBadge = entry.action && entry.action !== 'no_action' ? `⚡(${entry.action}) ` : ''
            message = `${statusBadge}${actionBadge}${entry.reason ?? JSON.stringify(entry)}`
          }

          // Use index as fallback key so React doesn't crash on duplicate "[object Object]" keys
          const itemKey = typeof entry === 'string' ? `${entry}-${index}` : index

          return (
            <div key={itemKey} className="log-viewer__entry">
              <span className="log-viewer__time">{time}</span>
              <span>{message}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react';
import { AlertCircle, CloudOff, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  clearDeadMutations,
  discardMutation,
  drainPendingQueue,
  readPendingQueue,
  subscribePendingQueue,
  type QueuedMutation,
} from '@/lib/pendingQueue';

/**
 * Floating toast pinned to the bottom-right that surfaces the
 * pending-mutation queue. Hidden when the queue is empty.
 *
 * Two visual flavours:
 *  - mostly-alive: orange "N Änderungen werden nachgespielt …" with a
 *    spinner. Drains automatically; user only sees this if it persists
 *    for more than a couple of seconds.
 *  - has-dead: red "N Änderungen konnten nicht gespeichert werden" with
 *    per-entry "Erneut versuchen" / "Verwerfen" actions, plus a "Alle
 *    löschen" footer. We don't auto-discard dead entries — the user
 *    must acknowledge that work was lost.
 */
export function PendingMutationsToast(): React.JSX.Element | null {
  const [queue, setQueue] = useState<QueuedMutation[]>(() => readPendingQueue());

  useEffect(() => subscribePendingQueue(setQueue), []);

  if (queue.length === 0) return null;

  const alive = queue.filter((m) => !m.dead);
  const dead = queue.filter((m) => m.dead);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-background shadow-lg">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2">
        {dead.length > 0 ? (
          <AlertCircle className="size-4 shrink-0 text-rose-500" />
        ) : (
          <CloudOff className="size-4 shrink-0 text-amber-500" />
        )}
        <div className="flex-1 text-sm font-medium">
          {dead.length > 0
            ? `${dead.length} Speicherung${dead.length === 1 ? '' : 'en'} fehlgeschlagen`
            : `${alive.length} Änderung${alive.length === 1 ? '' : 'en'} ausstehend`}
        </div>
        {dead.length === 0 && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <ul className="max-h-64 overflow-auto px-3 py-2">
        {queue.slice(0, 8).map((m) => (
          <li
            key={m.id}
            className={cn(
              'flex items-start gap-2 py-1.5 text-xs',
              m.dead ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground',
            )}
          >
            <span className="flex-1 truncate">{m.label}</span>
            {m.dead && (
              <button
                type="button"
                onClick={() => discardMutation(m.id)}
                className="rounded p-0.5 hover:bg-muted"
                title="Verwerfen"
                aria-label="Verwerfen"
              >
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
        {queue.length > 8 && (
          <li className="py-1 text-xs italic text-muted-foreground">… und {queue.length - 8} weitere</li>
        )}
      </ul>

      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        {dead.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => clearDeadMutations()}>
            Verwerfen
          </Button>
        )}
        <Button size="sm" onClick={() => void drainPendingQueue()}>
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}

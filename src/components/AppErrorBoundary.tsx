import { AlertTriangle, MessageSquarePlus, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { openFeedback } from '@/components/feedback/FeedbackWidget';

/**
 * Catches render-time exceptions from any child route so a bug in a
 * single popover / page doesn't whiteout the entire app shell.
 *
 * Specifically catches the kind of failure we hit when Radix's Slot
 * pattern is misused (`Primitive.div failed to slot onto its children`)
 * — those throw synchronously during render of a portal'd component
 * and bubble past the normal React tree recovery.
 *
 * The reset button restores the boundary's state so a quick fix
 * doesn't require a full reload — but the user can still pick that
 * with the "Seite neu laden" link as a fallback.
 *
 * The captured error is also written to the console so devtools and
 * Refine-Devtools keep a record.
 */
type State = { error: Error | null };

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced separately so devtools shows both the error stack and
    // the React component stack that produced it.
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto size-10 text-destructive" />
          <h2 className="text-lg font-semibold">Etwas ist schiefgelaufen</h2>
          <p className="text-sm text-muted-foreground">
            Dieser Bereich konnte nicht gerendert werden. Die Sidebar
            bleibt nutzbar — Du kannst zu einer anderen Seite navigieren.
          </p>
          <pre className="overflow-x-auto rounded border bg-background p-2 text-left text-xs text-destructive">
            {this.state.error.message}
          </pre>
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={this.reset}>
              <RefreshCw className="size-3.5" />
              Erneut versuchen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              Seite neu laden
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mx-auto"
            onClick={() =>
              openFeedback({
                category: 'bug',
                title: `Fehler: ${this.state.error?.message ?? ''}`.slice(0, 120),
                description:
                  'Dieser Bereich ist abgestürzt. Technische Details werden automatisch mitgesendet.',
              })
            }
          >
            <MessageSquarePlus className="size-3.5" />
            Problem melden
          </Button>
        </div>
      </div>
    );
  }
}

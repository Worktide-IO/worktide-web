import { lazy, Suspense, useEffect } from 'react';

/**
 * Dev-only bridge: lazy-loads the network simulator and its panel
 * when `import.meta.env.DEV` is true. In a production build Vite
 * statically folds `import.meta.env.DEV` → `false`, dead-branches
 * the dynamic import + lazy reference, and the simulator code path
 * never enters the prod bundle.
 *
 * Keeping the gate isolated here means AppLayout stays pure
 * synchronous JSX — no top-level await, no awkward async-module
 * cascade through every consumer of the layout.
 */
const NetworkSimulatorPanel = import.meta.env.DEV
  ? lazy(() =>
      import('@/components/NetworkSimulatorPanel').then((m) => ({ default: m.NetworkSimulatorPanel })),
    )
  : null;

export function DevToolsBridge(): React.JSX.Element | null {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import('@/lib/networkSimulator').then(({ installNetworkSimulator }) =>
      installNetworkSimulator(),
    );
  }, []);

  if (!NetworkSimulatorPanel) return null;
  return (
    <Suspense fallback={null}>
      <NetworkSimulatorPanel />
    </Suspense>
  );
}

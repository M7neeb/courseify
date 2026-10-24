// The current time as reactive state, so screens that show "today" move on to the next day when the
// app is left open past midnight or brought back from the background (the iPhone Home Screen app
// resumes instead of reloading).

export const today = $state({ now: Date.now() });

if (typeof window !== 'undefined') {
  const tick = () => {
    today.now = Date.now();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  setInterval(tick, 60_000);
}

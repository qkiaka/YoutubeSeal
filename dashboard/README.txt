YOUTUBESEAL DASHBOARD (LOCAL TEST VERSION)
=========================================

This dashboard uses the same Planetube Supabase project as the Chrome extension.

HOW TO RUN LOCALLY
1. Keep index.html, app.js, and style.css in the same folder.
2. In VS Code, open this folder.
3. Use the Live Server extension and click "Go Live".
   (Avoid opening index.html directly as file:// because browsers can restrict API requests from local files.)
4. Sign in using the same email and password as the YoutubeSeal Chrome extension.
5. Start a NEW seal in the extension while signed in.
6. Return to this dashboard and click "Refresh data".

WHAT IT READS
- ys_profiles: display name
- ys_planets: growth points and level
- ys_seal_sessions: seal-session history (test records are marked TEST)

The dashboard does not display sample sessions or sample friends.
Developer Cheat Mode can create marked TEST records for the authorized test account; these appear in the same history and metrics.
Friends are not implemented yet.
The extension currently initializes planet growth points at 0 and level 1, but does not award growth points yet.
The dashboard only counts completed session durations as protected time.

SECURITY
- The publishable key is intended for browser use.
- Do not add a service_role key or secret key to these files.
- Database Row Level Security must remain enabled.
- The dashboard stores its own login session in this browser's localStorage. Logging out here does not log out the extension.

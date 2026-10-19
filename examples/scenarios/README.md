# Private scenario models

Original synthetic fixtures and application state for the walking and itinerary examples.
Both Web and Expo inject the same core `MapController`, clock, scheduler and app-owned storage.
This package is private and never included in SDK npm tarballs. No real users, GPS, external
search/routing service, copied application code, API keys or telemetry.

Walking records only generated coordinates (maximum 120 samples; latest five walks), supports
pause/resume/stop, local save/reload and replay. Trips search six fictional POIs, persist up to
three days of unique place IDs, select cards and fit each day's camera. Route lines indicate
synthetic visiting order, not a computed street route. Standard for trips; Pastel/Outdoor for walks.

Persistence key: `kmk-synthetic-scenarios-v1`. Web uses localStorage; Expo uses AsyncStorage.
Only explicit Save actions persist records. Invalid saved JSON blocks writes until the user
chooses the clearly labeled reset action. Storage failures preserve the previous in-memory state.
The reset action clears both apps' demo records, never unrelated storage keys.

Session disposal removes its event subscription, cancels map work/timers/replay, and clears its
recorder. The platform view owns MapController destruction. Background pauses; returning does
not automatically record. UI actions serialize, recording renders at most once per second,
and replay updates at most four times per second. These are implementation bounds, not an
Android/iOS frame-rate certification.

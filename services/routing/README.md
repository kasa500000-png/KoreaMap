# routing service

Private operator service: pinned Valhalla Docker graph and loopback Node gateway,
independent of search/PostGIS. Importing the SDK starts neither service.

See [routing guide](../../docs/routing.md) for OSM input rights, versioned regional
builds, explicit configuration, startup, updates and rollback. The SDK packages
must never import this directory. No engine URL, account, automatic download,
straight-line route fallback, traffic or safety guarantee is supplied.

`pnpm test:routing` builds an authored synthetic road PBF inside ignored artifacts,
starts the real engine and checks three modes, waypoints, disconnected roads and
the private gateway. Default `pnpm check` remains Docker/API-key independent.

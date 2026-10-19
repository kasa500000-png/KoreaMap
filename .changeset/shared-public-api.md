---
'@korea-map-kit/core': minor
'@korea-map-kit/web': minor
'@korea-map-kit/native': minor
'@korea-map-kit/data-adapters': patch
---

Add a platform-neutral MapController, shared map/provider contracts, JSON/geometry validation and portable cancellation/deadlines. Web exposes handle.api; Native exposes the same controller through MapView ref, with local geometry styles only until a resource-origin gate is implemented. Preserve legacy Web methods and core type names.

The KitErrorCode union gains TIMEOUT, PERMISSION_DENIED, NETWORK_ERROR and NOT_FOUND. Consumers using exhaustive switches must handle these values in this 0.x minor release. Cancellation does not imply rollback; cancelling an in-progress style replacement disposes that map. Native real-device rendering remains unverified.

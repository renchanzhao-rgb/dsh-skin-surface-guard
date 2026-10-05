/**
 * Host half of the queue-dock guard bundle.
 *
 * The guard is purely client-side CSS: it needs no service, emits no event and
 * holds no state on the host. This entry exists only because a bundle row must
 * name a package whose entry point carries an `apply`.
 *
 * @module dsh-skin-surface-guard
 */

/** No host-side work: the client half owns the whole guard. */
export function apply() {}

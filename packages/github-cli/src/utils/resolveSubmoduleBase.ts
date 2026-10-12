import chalk from 'chalk';

/**
 * The pull request lands on the trunk, so its submodules follow theirs: they are fetched, parked,
 * fast-forwarded and merged against `trunk`, their pull requests target it, and a merge re-points
 * the gitlinks at the merged commits.
 */
export interface TrunkSubmoduleBase {
    kind: 'trunk';
    trunk: string;
}

/**
 * The pull request lands on `landingTrunk`, which is not the trunk (a hotfix into `release`, say).
 * Every submodule stays on the commit its gitlink pins: nothing is fetched, parked, fast-forwarded
 * or merged against any base inside it, no submodule pull request is opened or readied, and no
 * gitlink is re-pointed. `trunk` is kept only to tell a submodule resting on the trunk apart from
 * one carrying work of its own.
 */
export interface PinnedSubmoduleBase {
    kind: 'pin';
    trunk: string;
    landingTrunk: string;
}

/**
 * What a product pull request's submodules follow — see {@link resolveSubmoduleBase}.
 */
export type SubmoduleBase = PinnedSubmoduleBase | TrunkSubmoduleBase;

/**
 * Parameters for {@link resolveSubmoduleBase}.
 */
export interface ResolveSubmoduleBaseParams {
    /**
     * The branch the product pull request finally lands on: its `base.ref` for an ordinary pull
     * request, and the base of the whole chain for a stacked one — never an upper node's parent
     * branch, which is only a step on the way there.
     */
    landingTrunk: string;

    /**
     * The product's trunk (e.g. `main`) — the first of the caller's configured base branches, and
     * the only branch a submodule ever follows.
     */
    trunk: string;
}

/**
 * Decide whether a product pull request's submodules follow the trunk or stay on their pin.
 *
 * A product owns its submodule pins, and only its trunk has them moved: every other branch it
 * deploys from receives a pin only by promotion, i.e. a pin the trunk has already run (nzyme's
 * `docs/consumers.md`). So a pull request that does not land on the trunk must leave every
 * submodule exactly where its gitlink says — moving one there would put an untested commit on a
 * production line. A submodule's own non-trunk branches are never a base either: nzyme's `release`
 * is its npm release line, and has nothing to do with the product's.
 * @__NO_SIDE_EFFECTS__
 */
export function resolveSubmoduleBase(params: ResolveSubmoduleBaseParams): SubmoduleBase {
    const { landingTrunk, trunk } = params;

    if (landingTrunk === trunk) {
        return { kind: 'trunk', trunk };
    }

    return { kind: 'pin', trunk, landingTrunk };
}

/**
 * The branch the product pull request lands on — what its main repository is synced with before a
 * refresh or a merge. Pinned, that is `landingTrunk`: syncing a hotfix into `release` with the trunk
 * would carry the whole trunk, submodule pins included, onto the production line.
 * @__NO_SIDE_EFFECTS__
 */
export function getLandingTrunk(submoduleBase: SubmoduleBase): string {
    return submoduleBase.kind === 'pin' ? submoduleBase.landingTrunk : submoduleBase.trunk;
}

/**
 * Say why the submodules are left alone, so a command that skipped them reads as a decision rather
 * than as nothing having happened.
 * @__NO_SIDE_EFFECTS__
 */
export function describeSubmodulePin(submoduleBase: PinnedSubmoduleBase): string {
    return (
        `📌 Submodules stay on their pinned commits: this branch lands on ${chalk.cyan(submoduleBase.landingTrunk)}, ` +
        `and only ${chalk.cyan(submoduleBase.trunk)} moves submodule pins`
    );
}

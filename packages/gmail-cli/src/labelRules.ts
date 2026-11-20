// Optional label rules a project declares in code (`GmailLabelRules`).
//
// Pure functions only: the Gmail calls live in the commands, so every rule is unit-testable. The
// rules, their validation and the planning of a thread change are one unit and share this file.

/** "A thread with label `when` must also carry one label of group `group`." */
export interface GmailLabelRequireRule {
    /** Label name. */
    when: string;
    /** Group key. */
    group: string;
}

/** The label rules and named search views a project declares for its Gmail commands. */
export interface GmailLabelRules {
    /** Mutually exclusive label sets by group key, changed only through the thread change's `set`. */
    groups?: Record<string, string[]>;
    /** Labels that need a label of some group alongside them. */
    require?: GmailLabelRequireRule[];
    /** The only labels that may take a thread out of INBOX. */
    archiveMarkers?: string[];
    /** Named Gmail queries for the search `--view`. */
    views?: Record<string, string>;
}

/** The labels a caller asks to change on a thread. */
export interface ThreadChange {
    /** Plain label names from addLabels. */
    add: string[];
    /** Plain label names from removeLabels. */
    remove: string[];
    /** Group -> label; null clears the group. */
    set: Record<string, string | null>;
}

/** What a thread change resolves to once the label rules are applied. */
export interface PlannedChange {
    /** Label names to add (group labels may not exist yet). */
    add: string[];
    /** Label names to remove. */
    remove: string[];
    /** The subset of `add` that came from `set` (created when missing). */
    setLabels: string[];
    /** Human-readable lines describing the change, e.g. `status: AI/Done` or `archived (INBOX removed)`. */
    summary: string[];
}

/** Arguments of {@link planThreadChange}. */
export interface PlanThreadChangeParams {
    rules: GmailLabelRules | undefined;
    change: ThreadChange;
    /** Label names the thread carries now, summed over its messages. */
    current: string[];
}

/** A change the project's label rules forbid; the message tells the caller how to do it right. */
export class RuleViolation extends Error {}

const IDENT = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Throws on what the `GmailLabelRules` type cannot rule out: a label in two groups, a `require` rule
 * naming an unknown group, an archive marker that is also a group label, and a group or view name
 * that is not an identifier (an `=` in it would break `--set group=label`).
 */
export function assertLabelRules(r: GmailLabelRules): void {
    const owner = new Map<string, string>();
    for (const [group, labels] of Object.entries(r.groups ?? {})) {
        assertIdentifier(`groups.${group}`, group);
        for (const label of labels) {
            const prev = owner.get(label.toLowerCase());
            if (prev) {
                throw new Error(`Invalid label rules: groups.${group}: '${label}' is already in group '${prev}'`);
            }
            owner.set(label.toLowerCase(), group);
        }
    }
    for (const [i, rule] of (r.require ?? []).entries()) {
        if (!r.groups?.[rule.group]) {
            throw new Error(`Invalid label rules: require[${i}]: unknown group '${rule.group}'`);
        }
    }
    for (const m of r.archiveMarkers ?? []) {
        const group = owner.get(m.toLowerCase());
        if (group) {
            throw new Error(`Invalid label rules: archiveMarkers: '${m}' is also in group '${group}'`);
        }
    }
    for (const view of Object.keys(r.views ?? {})) {
        assertIdentifier(`views.${view}`, view);
    }
}

/**
 * The group a label belongs to, matched case-insensitively.
 * @__NO_SIDE_EFFECTS__
 */
export function groupOf(rules: GmailLabelRules, label: string): string | undefined {
    for (const [group, labels] of Object.entries(rules.groups ?? {})) {
        if (has(labels, label)) {
            return group;
        }
    }
    return undefined;
}

/**
 * Whether a label is one of the archive markers.
 * @__NO_SIDE_EFFECTS__
 */
export function isMarker(rules: GmailLabelRules, label: string): boolean {
    return has(rules.archiveMarkers ?? [], label);
}

/**
 * Labels cleanup must never delete: the project's rules depend on them.
 * @__NO_SIDE_EFFECTS__
 */
export function protectedLabels(rules: GmailLabelRules | undefined): string[] {
    if (!rules) {
        return [];
    }
    return [...Object.values(rules.groups ?? {}).flat(), ...(rules.archiveMarkers ?? [])];
}

/**
 * What a thread update should do to a thread that currently carries `current`. Throws RuleViolation
 * before anything is written.
 * @__NO_SIDE_EFFECTS__
 */
export function planThreadChange(params: PlanThreadChangeParams): PlannedChange {
    const { rules, change, current } = params;
    const r = rules ?? {};
    const groups = r.groups ?? {};
    const add: string[] = [];
    const remove: string[] = [];
    const setLabels: string[] = [];
    const summary: string[] = [];

    const managed = [...change.add, ...change.remove].filter(l => groupOf(r, l));
    if (managed.length) {
        const hints = managed.map(l => `${l} -> set.${groupOf(r, l)}`).join(', ');
        throw new RuleViolation(
            `Labels ${managed.join(', ')} belong to an exclusive group and can only be changed through 'set' (${hints}). ` +
                `Setting one label of a group removes the others.`,
        );
    }

    for (const [group, value] of Object.entries(change.set)) {
        const members = groups[group];
        if (!members) {
            const known = Object.keys(groups);
            throw new RuleViolation(
                `Unknown group '${group}' in 'set'. ` +
                    (known.length ? `Groups: ${known.join(', ')}` : 'This project defines no label groups.'),
            );
        }
        let canonical: string | null = null;
        if (value !== null && value !== '') {
            canonical = members.find(m => lower(m) === lower(value)) ?? null;
            if (!canonical) {
                throw new RuleViolation(
                    `'${value}' is not in group '${group}' (${members.join(', ')}); use null to clear the group`,
                );
            }
            pushUnique(add, canonical);
            pushUnique(setLabels, canonical);
            summary.push(`${group}: ${canonical}`);
        } else {
            summary.push(`${group}: cleared`);
        }
        for (const m of members) {
            if (m !== canonical && has(current, m)) {
                pushUnique(remove, m);
            }
        }
    }

    for (const l of change.add) {
        pushUnique(add, l);
    }
    for (const l of change.remove) {
        pushUnique(remove, l);
    }
    if (change.add.length) {
        summary.push(`added: ${change.add.join(', ')}`);
    }
    if (change.remove.length) {
        summary.push(`removed: ${change.remove.join(', ')}`);
    }

    const resulting = current.filter(l => !has(remove, l));
    for (const l of add) {
        if (!has(resulting, l) && !has(remove, l)) {
            resulting.push(l);
        }
    }

    const markers = r.archiveMarkers ?? [];
    if (markers.length) {
        const removingInbox = has(change.remove, 'INBOX');
        const addingMarker = change.add.some(l => isMarker(r, l));
        const markerAfter = resulting.some(l => isMarker(r, l));
        if (removingInbox && !markerAfter) {
            throw new RuleViolation(
                `Removing INBOX (archiving) requires an archive marker: add ${markers.map(m => `'${m}'`).join(' or ')} in addLabels ` +
                    `and INBOX is removed for you. Other labels only tag the thread and leave it in INBOX.`,
            );
        }
        if (addingMarker && !has(remove, 'INBOX')) {
            pushUnique(remove, 'INBOX');
            summary.push('archived (INBOX removed)');
        }
    }

    for (const rule of r.require ?? []) {
        const members = groups[rule.group] ?? [];
        const whenGroup = groupOf(r, rule.when);
        const touched =
            has(change.add, rule.when) ||
            rule.group in change.set ||
            (whenGroup !== undefined && whenGroup in change.set);
        if (!touched) {
            continue;
        }
        if (has(resulting, rule.when) && !members.some(m => has(resulting, m))) {
            throw new RuleViolation(
                `A thread labelled '${rule.when}' must also carry one of group '${rule.group}' (${members.join(', ')}). ` +
                    `Pass set.${rule.group} in this call.`,
            );
        }
    }

    // Never add and remove the same label in one call: removal wins.
    return { add: add.filter(l => !has(remove, l)), remove, setLabels, summary };
}

/**
 * The Gmail query of a named view, empty when no view is asked for. Throws RuleViolation for an unknown one.
 * @__NO_SIDE_EFFECTS__
 */
export function viewQuery(rules: GmailLabelRules | undefined, view: string | undefined): string {
    if (!view) {
        return '';
    }
    const views = rules?.views ?? {};
    const q = views[view];
    if (q === undefined) {
        const known = Object.keys(views);
        throw new RuleViolation(
            `Unknown view '${view}'. ` +
                (known.length ? `Views: ${known.join(', ')}.` : 'This project defines no views.') +
                " Omit 'view' to run the query across all mail.",
        );
    }
    return q;
}

function assertIdentifier(where: string, name: string): void {
    if (!IDENT.test(name)) {
        throw new Error(`Invalid label rules: ${where}: names must be identifiers`);
    }
}

function lower(s: string): string {
    return s.toLowerCase();
}

function has(list: string[], name: string): boolean {
    return list.some(l => lower(l) === lower(name));
}

function pushUnique(list: string[], name: string): void {
    if (!has(list, name)) {
        list.push(name);
    }
}

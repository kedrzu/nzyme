/**
 * Placement of a single deployed stack: its Pulumi coordinates and provider region.
 *
 * A placement is produced by app-level factories (e.g. `regionalPlacement` / `globalPlacement` in the
 * consuming project) and consumed by the framework. The framework treats `stackName` / `region` /
 * `project` as opaque strings — it never knows about concrete regions or naming conventions, so the
 * region dimension stays entirely in the application layer.
 */
export interface StackPlacement {
    /**
     * Pulumi stack name, unique within the project (e.g. `database-eu-central-1`, `dns-global`).
     * Drives both the IoC service identity and the Pulumi stack name, so two placements of the same
     * logical stack never collide.
     */
    stackName: string;

    /**
     * AWS region for this stack's default provider — written as `aws:region` in the stack config.
     * Global stacks pass their fixed region (e.g. `us-east-1`).
     */
    region: string;

    /**
     * Pulumi project for this placement. Optional — defaults to the single project in
     * {@link PulumiConfig.project}. Reserved for future per-residency-zone project/account isolation
     * and cross-project references; not used today.
     */
    project?: string;
}

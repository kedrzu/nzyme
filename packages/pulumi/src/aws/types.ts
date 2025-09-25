import type * as aws from '@pulumi/aws';

import type { UnwrapShallow } from '../types.js';

/**
 * The properties of a Cloudfront origin.
 */
export type CloudfrontOriginProps = UnwrapShallow<UnwrapShallow<aws.cloudfront.DistributionArgs['origins']>[number]>;

/**
 * The properties of a Cloudfront ordered behavior.
 */
export type CloudfrontOrderedBehaviorProps = NonNullable<
    UnwrapShallow<aws.cloudfront.DistributionArgs['orderedCacheBehaviors']>
>[number];

/**
 * The properties of a Cloudfront default behavior.
 */
export type CloudfrontDefaultBehaviorProps = NonNullable<
    UnwrapShallow<aws.cloudfront.DistributionArgs['defaultCacheBehavior']>
>;

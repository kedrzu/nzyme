import type * as aws from '@pulumi/aws';

import type { Defined } from '@nzyme/types';

import type { UnwrapShallow } from '../types.js';

/**
 * The properties of a Cloudfront origin.
 */
export type CloudfrontOriginProps = UnwrapShallow<UnwrapShallow<aws.cloudfront.DistributionArgs['origins']>[number]>;

/**
 * The properties of a Cloudfront ordered behavior.
 */
export type CloudfrontOrderedBehaviorProps = Defined<
    UnwrapShallow<aws.cloudfront.DistributionArgs['orderedCacheBehaviors']>
>[number];

/**
 * The properties of a Cloudfront default behavior.
 */
export type CloudfrontDefaultBehaviorProps = Defined<
    UnwrapShallow<aws.cloudfront.DistributionArgs['defaultCacheBehavior']>
>;

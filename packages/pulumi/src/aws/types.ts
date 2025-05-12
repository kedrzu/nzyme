import type * as aws from '@pulumi/aws';
import type { UnwrapShallow } from '../types.js';

/**
 * The properties of a Cloudfront origin.
 */

export type CloudfrontOriginProps = UnwrapShallow<aws.cloudfront.DistributionArgs['origins']>[number];

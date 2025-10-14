import type {} from '@nzyme/utils';

declare global {
    interface Navigator {
        userAgentData?: {
            mobile: boolean;
            platform: string;
        };
    }
}

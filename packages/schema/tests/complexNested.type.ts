/**
 * API Response wrapper
 */
export interface ApiResponse {
    /** Response data */
    data?: unknown;
    /** Response metadata */
    meta: {
        page: number;
        perPage: number;
        total: number;
    };
    /** Validation errors if any */
    errors?: Array<{
        code: number;
        field: string;
        message: string;
    }>;
}

/**
 * User profile with nested data
 */
export interface UserProfile {
    /** User basic info */
    user: {
        avatar?: string | null;
        id: number;
        name: string;
    };
    /** User preferences */
    preferences: {
        language: string;
        notifications: boolean;
        theme: 'dark' | 'light';
    };
    /** User permissions */
    permissions: string[];
    /** Additional metadata */
    metadata: Record<string, unknown>;
    /** Creation timestamp */
    createdAt: number;
}

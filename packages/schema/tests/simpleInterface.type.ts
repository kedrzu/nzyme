/**
 * User interface for authentication
 * @description This is a simple interface for a user
 * @since 1.0.0
 * @author John Doe
 */
export interface User {
    /**
     * User's unique identifier
     */
    id: number;
    /**
     * User's full name
     * @description This is the full name of the user
     */
    name: string;
    /**
     * User's email address
     * @description This is the email address of the user
     */
    email: string;
    /**
     * Whether the user is active
     * @description This is a boolean value that indicates if the user is active
     */
    active?: boolean;
}

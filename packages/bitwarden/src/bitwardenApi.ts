/**
 * The Bitwarden Secrets Manager API routes this package calls, in the `paths` shape that
 * openapi-typescript emits, for `createOpenApiFetch`. Hand-written from the server's
 * `SecretsController` and its request and response models, and checked against the OpenAPI document
 * the server's build publishes (not committed: it is not under our license). Only the fields this
 * package reads or sends are declared. `key`, `value` and `note` are EncStrings.
 */
export interface BitwardenApiPaths {
    '/projects/{projectId}/secrets': {
        get: {
            parameters: { path: { projectId: string } };
            responses: { 200: JsonContent<BitwardenProjectSecretsResponse> };
        };
    };
    '/secrets/get-by-ids': {
        post: {
            requestBody: JsonContent<BitwardenSecretsGetRequest>;
            /** 404 when any of the ids does not exist (anymore). */
            responses: { 200: JsonContent<BitwardenSecretsResponse>; 404: unknown };
        };
    };
    '/organizations/{organizationId}/secrets': {
        post: {
            parameters: { path: { organizationId: string } };
            requestBody: JsonContent<BitwardenSecretCreateRequest>;
            responses: { 200: JsonContent<BitwardenSecret> };
        };
    };
    '/secrets/{id}': {
        put: {
            parameters: { path: { id: string } };
            requestBody: JsonContent<BitwardenSecretUpdateRequest>;
            responses: { 200: JsonContent<BitwardenSecret> };
        };
    };
}

/**
 * `SecretWithProjectsListResponseModel`: the secrets of a project, without values or notes.
 */
export interface BitwardenProjectSecretsResponse {
    secrets: BitwardenSecretSummary[] | null;
}

/**
 * `SecretsWithProjectsInnerSecret`: one entry of a project listing.
 */
export interface BitwardenSecretSummary {
    id: string;
    organizationId: string;
    key: string | null;
}

/**
 * `GetSecretsRequestModel`.
 */
export interface BitwardenSecretsGetRequest {
    ids: string[];
}

/**
 * `ListResponseModel<BaseSecretResponseModel>`.
 */
export interface BitwardenSecretsResponse {
    data: BitwardenSecret[] | null;
}

/**
 * `BaseSecretResponseModel`: a secret with its value and note.
 */
export interface BitwardenSecret {
    id: string;
    organizationId: string;
    key: string | null;
    value: string | null;
    note: string | null;
    projects: BitwardenSecretProject[] | null;
}

/**
 * `SecretResponseInnerProject`.
 */
export interface BitwardenSecretProject {
    id: string;
}

/**
 * `SecretCreateRequestModel`. The server requires `key`, `value` and `note`, each a non-empty
 * EncString, and accepts at most one project.
 */
export interface BitwardenSecretCreateRequest {
    key: string;
    value: string;
    note: string;
    projectIds: string[];
}

/**
 * `SecretUpdateRequestModel`. The server replaces the secret's projects with `projectIds` unless its
 * first project equals `projectIds[0]` (a missing `projectIds` removes it from its project), so an
 * update always re-sends the project.
 */
export interface BitwardenSecretUpdateRequest extends BitwardenSecretCreateRequest {
    valueChanged: boolean;
}

interface JsonContent<T> {
    content: { 'application/json': T };
}

/**
 * The slice of oxlint's JS-plugin API this package touches.
 *
 * `oxlint` declares all of these itself but exports none of them: its entry point exports
 * `defineConfig` plus config types, `oxlint/plugins-dev` exports only `RuleTester`, and there is no
 * `oxlint/plugins` subpath. A plugin written in TypeScript therefore has to restate the parts it
 * reads. Everything below mirrors oxlint's own declarations (`dist/plugins-dev.d.ts`) narrowed to
 * the members used here, so a mismatch shows up as a type error rather than a silent `undefined`.
 */

/** A plugin module's default export — what oxlint loads from a `jsPlugins` config entry. */
export interface OxlintPlugin {
    /** `name` is the prefix of every rule id this plugin contributes. */
    meta: { name: string };
    /** Keyed by the bare rule name; oxlint publishes each as `<plugin name>/<rule name>`. */
    rules: Record<string, OxlintRule>;
}

export interface OxlintRule {
    meta: OxlintRuleMeta;
    create(context: OxlintRuleContext): OxlintVisitor;
}

export interface OxlintRuleMeta {
    type: 'layout' | 'problem' | 'suggestion';
    docs: { description: string };
    /** Message templates, selected by the `messageId` passed to `report`. */
    messages: Record<string, string>;
}

export interface OxlintRuleContext {
    /** Absolute path of the file being linted. */
    filename: string;
    sourceCode: OxlintSourceCode;
    report(diagnostic: OxlintDiagnostic): void;
}

export interface OxlintDiagnostic {
    messageId: string;
    node: OxlintNode;
    /** Values interpolated into the message template's `{{placeholder}}`s. */
    data?: Record<string, string>;
}

export interface OxlintSourceCode {
    /** Innermost scope containing `node`; follow `upper` to reach an outer declaration. */
    getScope(node: OxlintNode): OxlintScope;
    /** Enclosing nodes, outermost (`Program`) first, so the last entry is `node`'s parent. */
    getAncestors(node: OxlintNode): OxlintNode[];
    /**
     * Comments between `node` and the token before it — the only way to read a JSDoc block here,
     * because `getJSDocComment` exists on this object but throws "not supported at present".
     */
    getCommentsBefore(node: OxlintNode): OxlintComment[];
}

export interface OxlintComment {
    /** Body without the delimiters, so a JSDoc block's value starts with `*`. */
    value: string;
}

export interface OxlintScope {
    variables: OxlintVariable[];
    upper: OxlintScope | null;
}

export interface OxlintVariable {
    name: string;
    defs: OxlintDefinition[];
}

/** Closed set of ways a name can be bound, as oxlint's scope manager classifies them. */
export type OxlintDefinitionType =
    | 'CatchClause'
    | 'ClassName'
    | 'FunctionName'
    | 'ImplicitGlobalVariable'
    | 'ImportBinding'
    | 'Parameter'
    | 'Variable';

export interface OxlintDefinition {
    type: OxlintDefinitionType;
    /**
     * The declaring node: a `FunctionDeclaration` for `FunctionName`, a `VariableDeclarator` for
     * `Variable`, an import specifier for `ImportBinding`.
     */
    node: OxlintNode;
    /**
     * The node the JSDoc hangs off, where it differs from `node`: the `VariableDeclaration` for
     * `Variable`, the `ImportDeclaration` for `ImportBinding`. `null` for a `FunctionName`.
     */
    parent: OxlintNode | null;
}

/**
 * Visitor callbacks oxlint invokes while walking a file. Only the node kinds this plugin listens
 * to are declared — oxlint accepts any AST node type as a key.
 */
export interface OxlintVisitor {
    ExpressionStatement?(node: OxlintExpressionStatement): void;
}

/**
 * Any AST node. Nothing but the discriminant is known in general, so narrow with `isNode` before
 * reading fields.
 */
export interface OxlintNode {
    type: string;
}

/** The node shapes this plugin reads, keyed by their `type` discriminant for `isNode`. */
export interface OxlintNodeTypes {
    AwaitExpression: OxlintAwaitExpression;
    CallExpression: OxlintCallExpression;
    Identifier: OxlintIdentifier;
    ImportDeclaration: OxlintImportDeclaration;
    ImportSpecifier: OxlintImportSpecifier;
    UnaryExpression: OxlintUnaryExpression;
}

export interface OxlintAwaitExpression {
    type: 'AwaitExpression';
    argument: OxlintNode;
}

export interface OxlintCallExpression {
    type: 'CallExpression';
    callee: OxlintNode;
}

export interface OxlintExpressionStatement {
    type: 'ExpressionStatement';
    expression: OxlintNode;
}

export interface OxlintIdentifier {
    type: 'Identifier';
    name: string;
}

export interface OxlintImportDeclaration {
    type: 'ImportDeclaration';
    /** The string literal after `from`; only its value is ever read, never its node type. */
    source: { value: string };
}

export interface OxlintImportSpecifier {
    type: 'ImportSpecifier';
    /** Name in the target module — an `Identifier`, or a literal for a string-named export. */
    imported: OxlintNode;
}

export interface OxlintUnaryExpression {
    type: 'UnaryExpression';
    operator: string;
    argument: OxlintNode;
}

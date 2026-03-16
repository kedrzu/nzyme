/** A builder for programmatically constructing JavaScript/TypeScript source code. */
export type ScriptBuilder = ReturnType<typeof createScript>;

interface ImportParams {
    from: string;
    import?: string;
    name?: string;
}

interface ExportParams {
    from: string;
    import?: string;
    name?: string;
}

/** Creates a script builder for generating import/export statements and code blocks. */
export function createScript() {
    const imports: string[] = [];
    const statements: string[] = [];
    const variables: Record<string, number | undefined> = {};

    return {
        addImport,
        addExport,
        addStatement,
        addEmptyLine,
        addComment,
        addVariable,
        getCode,
    };

    function addImport(params: ImportParams) {
        const importName = addVariable(params.name || params.import || 'imp');

        if (!params.import) {
            // Default import
            imports.push(`import ${importName} from "${params.from}";`);
        } else if (params.import === '*') {
            // Import all
            imports.push(`import * as ${importName} from "${params.from}";`);
        } else {
            // Named import
            if (params.import === importName) {
                imports.push(`import { ${params.import} } from "${params.from}";`);
            } else {
                imports.push(`import { ${params.import} as ${importName} } from "${params.from}";`);
            }
        }

        return importName;
    }

    function addExport(params: ExportParams) {
        const exportName = addVariable(params.name || 'export');

        if (!params.import) {
            // Default export
            statements.push(`export default ${exportName};`);
        } else if (params.import === '*') {
            // Export all
            statements.push(`export * from "${params.from}";`);
        } else {
            // Named export
            statements.push(`export { ${params.import} as ${exportName} } from "${params.from}";`);
        }
    }

    function addStatement(statement: string) {
        if (!statement.endsWith(';')) {
            statement += ';';
        }

        statements.push(statement);
    }

    function addEmptyLine() {
        statements.push('');
    }

    function addComment(comment: string) {
        statements.push(`// ${comment}`);
    }

    function addVariable(name: string = 'var') {
        if (variables[name] == null) {
            variables[name] = 0;
            return name;
        }

        variables[name]++;
        return `${name}_${variables[name]}`;
    }

    function getCode() {
        let code = '';

        code += imports.join('\n');
        code += '\n\n';
        code += statements.join('\n');

        return code;
    }
}

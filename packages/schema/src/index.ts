// AST parsing layer
export { type ParsedTypeDefinition, parseTypeFile, type ParseTypeFileResult } from './ast/parseTypeFile.js';

// Main API
export * from './generateSchema.js';

// Output generation layer
export * from './output/generateSchemaFile.js';

// Schema transformation layer
export { type SchemaDefinition, transformAstToSchema } from './transform/astToSchema.js';

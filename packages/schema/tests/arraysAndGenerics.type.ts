export interface DataContainer {
    items: string[];
    matrix: number[][];
    genericArray: Array<boolean>;
    complexArray: Array<{
        id: number;
        tags: string[];
    }>;
    recordData: Record<string, number>;
    optionalRecord?: Record<string, unknown>;
}

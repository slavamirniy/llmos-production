export type JsonSchemaProperty =
    | { type: "string"; description?: string, enum?: string[] }
    | { type: "number"; description?: string }
    | { type: "boolean"; description?: string }
    | { type: "array"; items: JsonSchemaProperty; description?: string }
    | { type: "object"; properties: Record<string, JsonSchemaProperty>; required: string[]; description?: string }


export type JsonSchemaToType<T> = T extends { type: string } ?
    T extends { type: "string" } ? string :
    T extends { type: "number" } ? number :
    T extends { type: "boolean" } ? boolean :
    T extends { type: "array"; items: infer I } ? JsonSchemaToType<I>[] :
    T extends { type: "object"; properties: infer P; required: infer R } ?
    // @ts-ignore

    { -readonly [K in keyof P]: K extends R[number] ? JsonSchemaToType<P[K]> : JsonSchemaToType<P[K]> | undefined } :
    never : never;

export function defineSchema<T extends JsonSchemaProperty>(schema: T): T {
    return schema;
}
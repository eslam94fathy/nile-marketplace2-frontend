/** An exhaustive label map: a missing or extra enum value fails type-checking (architecture §8). */
export type Labels<Value extends string> = Readonly<Record<Value, string>>;

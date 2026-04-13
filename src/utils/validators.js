export function hasRequiredValues(...values) {
    return values.every((value) => Boolean(value && String(value).trim()));
}

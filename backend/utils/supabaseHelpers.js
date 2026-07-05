function snakeToCamel(key) {
    return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function camelToSnake(key) {
    return key.replace(/([A-Z])/g, (_, char) => `_${char.toLowerCase()}`);
}

function transformKeys(value, transformFn) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
        return value.map((item) => transformKeys(item, transformFn));
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, val]) => [transformFn(key), transformKeys(val, transformFn)])
        );
    }
    return value;
}

const toCamel = (value) => transformKeys(value, snakeToCamel);
const toSnake = (value) => transformKeys(value, camelToSnake);

function normalizeRow(row) {
    if (!row) return row;
    const camel = toCamel(row);
    if (camel.id && camel._id === undefined) {
        return { ...camel, _id: camel.id };
    }
    return camel;
}

function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(normalizeRow);
}

module.exports = {
    toCamel,
    toSnake,
    normalizeRow,
    normalizeRows
};

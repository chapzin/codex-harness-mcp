function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function validateAgainstSchema(schema, value, path = "args") {
  if (!schema || typeof schema !== "object") return null;
  if (value === undefined) return null;

  const expected = schema.type;

  if (expected === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return `${path}: expected object, got ${typeName(value)}`;
    }
    const properties = schema.properties || {};
    const required = schema.required || [];
    for (const req of required) {
      if (!(req in value) || value[req] === undefined) {
        return `${path}: missing required property "${req}"`;
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          return `${path}: unexpected property "${key}"`;
        }
      }
    }
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in value && value[key] !== undefined) {
        const err = validateAgainstSchema(propSchema, value[key], `${path}.${key}`);
        if (err) return err;
      }
    }
    return null;
  }

  if (expected === "string") {
    if (typeof value !== "string") {
      return `${path}: expected string, got ${typeName(value)}`;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      return `${path}: string shorter than minLength=${schema.minLength} (got ${value.length})`;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      return `${path}: value "${value}" not in enum ${JSON.stringify(schema.enum)}`;
    }
    return null;
  }

  if (expected === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return `${path}: expected integer, got ${typeName(value)}${typeof value === "number" ? " (non-integer)" : ""}`;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      return `${path}: integer below minimum=${schema.minimum}`;
    }
    return null;
  }

  if (expected === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return `${path}: expected number, got ${typeName(value)}`;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      return `${path}: number below minimum=${schema.minimum}`;
    }
    return null;
  }

  if (expected === "boolean") {
    if (typeof value !== "boolean") {
      return `${path}: expected boolean, got ${typeName(value)}`;
    }
    return null;
  }

  if (expected === "array") {
    if (!Array.isArray(value)) {
      return `${path}: expected array, got ${typeName(value)}`;
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const err = validateAgainstSchema(schema.items, value[i], `${path}[${i}]`);
        if (err) return err;
      }
    }
    return null;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path}: value not in enum ${JSON.stringify(schema.enum)}`;
  }

  return null;
}

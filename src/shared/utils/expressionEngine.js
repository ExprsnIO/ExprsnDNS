/**
 * Unified Expression Engine
 *
 * Combines JSONLex (JSONata) and Power Apps-style formula evaluation
 * for use across all Exprsn services.
 *
 * Supports:
 * - JSONata expressions (JSONLex)
 * - Power Apps-style formulas (expr-eval)
 * - Joi schema validation
 * - Data transformation pipelines
 */

const jsonata = require('jsonata');
const { Parser } = require('expr-eval');
const Joi = require('joi');

class ExpressionEngine {
  constructor() {
    this.parser = new Parser();
    this.enabled = process.env.EXPRESSION_ENGINE_ENABLED !== 'false';
    this.strictValidation = process.env.EXPRESSION_VALIDATION_STRICT === 'true';
    this.defaultEngine = process.env.EXPRESSION_ENGINE || 'jsonata'; // 'jsonata' or 'formula'
  }

  // ═══════════════════════════════════════════════════════════
  // JSONATA / JSONLex Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Transform data using JSONata expression
   */
  async transform(data, expression, options = {}) {
    try {
      const compiled = jsonata(expression);

      // Set timeout if specified
      if (options.timeout) {
        compiled.timeout = options.timeout;
      }

      const result = await compiled.evaluate(data);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Query data using JSONata
   */
  async query(data, queryExpression) {
    try {
      const expression = jsonata(queryExpression);
      const result = await expression.evaluate(data);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Filter array data using JSONata predicate
   */
  async filter(data, predicate) {
    try {
      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      const expression = jsonata(`$[${predicate}]`);
      const result = await expression.evaluate(data);

      return {
        success: true,
        data: result || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Map array data using JSONata expression
   */
  async map(data, mapping) {
    try {
      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      const expression = jsonata(`$.(${mapping})`);
      const result = await expression.evaluate(data);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reduce array data using JSONata expression
   */
  async reduce(data, expression, initialValue) {
    try {
      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      const compiled = jsonata(
        `$reduce($, function($acc, $item) { ${expression} }, ${JSON.stringify(initialValue)})`
      );
      const result = await compiled.evaluate(data);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Power Apps-Style Formula Methods (using expr-eval)
  // ═══════════════════════════════════════════════════════════

  /**
   * Evaluate a Power Apps-style formula
   */
  evaluateFormula(formula, context = {}) {
    try {
      // Simple variable reference
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(formula)) {
        return context[formula];
      }

      // Parse and evaluate
      const expression = this.parser.parse(formula);
      const result = expression.evaluate(context);

      return result;
    } catch (error) {
      throw new Error(`Formula error: ${error.message}`);
    }
  }

  /**
   * Evaluate with safe error handling
   */
  evaluateFormulaSafe(formula, context = {}) {
    try {
      const result = this.evaluateFormula(formula, context);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Unified Evaluation (auto-detect expression type)
  // ═══════════════════════════════════════════════════════════

  /**
   * Evaluate expression (auto-detects JSONata vs Formula syntax)
   */
  async evaluate(expression, data = {}, options = {}) {
    const engine = options.engine || this.defaultEngine;

    if (engine === 'jsonata') {
      return await this.transform(data, expression, options);
    } else if (engine === 'formula') {
      return this.evaluateFormulaSafe(expression, data);
    } else {
      // Auto-detect based on syntax
      if (this.isJSONataExpression(expression)) {
        return await this.transform(data, expression, options);
      } else {
        return this.evaluateFormulaSafe(expression, data);
      }
    }
  }

  /**
   * Detect if expression is JSONata syntax
   */
  isJSONataExpression(expr) {
    // JSONata uses $ for context, [] for arrays, {} for objects
    return /[$\[\]{}]/.test(expr) && !expr.includes('(');
  }

  // ═══════════════════════════════════════════════════════════
  // Validation (Joi Schema)
  // ═══════════════════════════════════════════════════════════

  /**
   * Validate data against JSONLex/JSON Schema
   */
  async validate(data, schema) {
    if (!this.enabled) {
      return { valid: true, data };
    }

    try {
      const joiSchema = this.convertToJoiSchema(schema);

      const { error, value } = joiSchema.validate(data, {
        abortEarly: !this.strictValidation,
        allowUnknown: !this.strictValidation
      });

      if (error) {
        return {
          valid: false,
          errors: error.details.map(detail => ({
            path: detail.path.join('.'),
            message: detail.message,
            type: detail.type
          }))
        };
      }

      return {
        valid: true,
        data: value
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Convert JSONLex/JSON Schema to Joi schema
   */
  convertToJoiSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return Joi.any();
    }

    const type = schema.type || 'object';

    switch (type) {
      case 'object':
        return this.buildObjectSchema(schema);
      case 'array':
        return this.buildArraySchema(schema);
      case 'string':
        return this.buildStringSchema(schema);
      case 'number':
      case 'integer':
        return this.buildNumberSchema(schema);
      case 'boolean':
        return Joi.boolean();
      case 'any':
        return Joi.any();
      default:
        return Joi.any();
    }
  }

  buildObjectSchema(schema) {
    let joiSchema = Joi.object();

    if (schema.properties) {
      const schemaMap = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        schemaMap[key] = this.convertToJoiSchema(propSchema);
      }
      joiSchema = joiSchema.keys(schemaMap);
    }

    if (schema.required && Array.isArray(schema.required)) {
      const requiredKeys = {};
      for (const key of schema.required) {
        requiredKeys[key] = Joi.any().required();
      }
      joiSchema = joiSchema.keys(requiredKeys);
    }

    if (schema.additionalProperties === false) {
      joiSchema = joiSchema.unknown(false);
    }

    return joiSchema;
  }

  buildArraySchema(schema) {
    let joiSchema = Joi.array();

    if (schema.items) {
      joiSchema = joiSchema.items(this.convertToJoiSchema(schema.items));
    }

    if (schema.minItems !== undefined) {
      joiSchema = joiSchema.min(schema.minItems);
    }

    if (schema.maxItems !== undefined) {
      joiSchema = joiSchema.max(schema.maxItems);
    }

    if (schema.uniqueItems) {
      joiSchema = joiSchema.unique();
    }

    return joiSchema;
  }

  buildStringSchema(schema) {
    let joiSchema = Joi.string();

    if (schema.minLength !== undefined) {
      joiSchema = joiSchema.min(schema.minLength);
    }

    if (schema.maxLength !== undefined) {
      joiSchema = joiSchema.max(schema.maxLength);
    }

    if (schema.pattern) {
      joiSchema = joiSchema.pattern(new RegExp(schema.pattern));
    }

    if (schema.format) {
      switch (schema.format) {
        case 'email':
          joiSchema = joiSchema.email();
          break;
        case 'uri':
        case 'url':
          joiSchema = joiSchema.uri();
          break;
        case 'uuid':
          joiSchema = joiSchema.uuid();
          break;
        case 'date':
        case 'date-time':
          joiSchema = joiSchema.isoDate();
          break;
      }
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      joiSchema = joiSchema.valid(...schema.enum);
    }

    return joiSchema;
  }

  buildNumberSchema(schema) {
    let joiSchema = schema.type === 'integer' ? Joi.number().integer() : Joi.number();

    if (schema.minimum !== undefined) {
      joiSchema = joiSchema.min(schema.minimum);
    }

    if (schema.maximum !== undefined) {
      joiSchema = joiSchema.max(schema.maximum);
    }

    if (schema.exclusiveMinimum !== undefined) {
      joiSchema = joiSchema.greater(schema.exclusiveMinimum);
    }

    if (schema.exclusiveMaximum !== undefined) {
      joiSchema = joiSchema.less(schema.exclusiveMaximum);
    }

    if (schema.multipleOf !== undefined) {
      joiSchema = joiSchema.multiple(schema.multipleOf);
    }

    return joiSchema;
  }

  // ═══════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Validate and transform in one operation
   */
  async validateAndTransform(data, schema, transformExpression, options = {}) {
    const validationResult = await this.validate(data, schema);

    if (!validationResult.valid) {
      return {
        success: false,
        errors: validationResult.errors
      };
    }

    if (transformExpression) {
      return await this.evaluate(transformExpression, validationResult.data, options);
    }

    return {
      success: true,
      data: validationResult.data
    };
  }

  /**
   * Infer schema from sample data
   */
  inferSchema(data) {
    if (data === null || data === undefined) {
      return { type: 'any' };
    }

    const type = Array.isArray(data) ? 'array' : typeof data;

    switch (type) {
      case 'object':
        const properties = {};
        for (const [key, value] of Object.entries(data)) {
          properties[key] = this.inferSchema(value);
        }
        return { type: 'object', properties };

      case 'array':
        if (data.length > 0) {
          return { type: 'array', items: this.inferSchema(data[0]) };
        }
        return { type: 'array' };

      case 'string':
        return { type: 'string' };

      case 'number':
        return { type: Number.isInteger(data) ? 'integer' : 'number' };

      case 'boolean':
        return { type: 'boolean' };

      default:
        return { type: 'any' };
    }
  }

  /**
   * Merge multiple schemas
   */
  mergeSchemas(...schemas) {
    const merged = {
      type: 'object',
      properties: {}
    };

    for (const schema of schemas) {
      if (schema.type === 'object' && schema.properties) {
        Object.assign(merged.properties, schema.properties);
      }
    }

    return merged;
  }
}

// Export singleton instance
module.exports = new ExpressionEngine();

// Also export class for testing
module.exports.ExpressionEngine = ExpressionEngine;

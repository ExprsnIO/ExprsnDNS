/**
 * ═══════════════════════════════════════════════════════════════════════
 * JSONLex - JSON Logic Expression Language
 * Simple expression language for dynamic queries and transformations
 * ═══════════════════════════════════════════════════════════════════════
 */

class JSONLex {
  /**
   * Compile a JSONLex expression
   * @param {*} expr - Expression to compile
   * @returns {Object} Compiled expression
   */
  static compile(expr) {
    if (typeof expr !== 'object' || expr === null) {
      return expr;
    }

    // Already compiled
    if (expr.__jsonlex) {
      return expr;
    }

    return {
      __jsonlex: true,
      expr: expr,
      compiled: Date.now()
    };
  }

  /**
   * Evaluate a JSONLex expression
   * @param {Object} expr - JSONLex expression
   * @param {Object} context - Evaluation context
   * @returns {*} Evaluated result
   */
  static evaluate(expr, context = {}) {
    if (!expr || !expr.__jsonlex) {
      return expr;
    }

    return this._evaluate(expr.expr, context);
  }

  /**
   * Internal evaluation logic
   * @private
   */
  static _evaluate(expr, context) {
    // Primitive values
    if (typeof expr !== 'object' || expr === null) {
      return expr;
    }

    // Array
    if (Array.isArray(expr)) {
      return expr.map(item => this._evaluate(item, context));
    }

    // Object operations
    const keys = Object.keys(expr);
    if (keys.length === 0) {
      return expr;
    }

    const firstKey = keys[0];

    // Variable reference: { "$var": "name" }
    if (firstKey === '$var') {
      return this._getVar(expr.$var, context);
    }

    // Equality: { "$eq": [a, b] }
    if (firstKey === '$eq') {
      const [a, b] = expr.$eq.map(v => this._evaluate(v, context));
      return a === b;
    }

    // Not equal: { "$ne": [a, b] }
    if (firstKey === '$ne') {
      const [a, b] = expr.$ne.map(v => this._evaluate(v, context));
      return a !== b;
    }

    // Greater than: { "$gt": [a, b] }
    if (firstKey === '$gt') {
      const [a, b] = expr.$gt.map(v => this._evaluate(v, context));
      return a > b;
    }

    // Less than: { "$lt": [a, b] }
    if (firstKey === '$lt') {
      const [a, b] = expr.$lt.map(v => this._evaluate(v, context));
      return a < b;
    }

    // Logical AND: { "$and": [expr1, expr2, ...] }
    if (firstKey === '$and') {
      return expr.$and.every(e => this._evaluate(e, context));
    }

    // Logical OR: { "$or": [expr1, expr2, ...] }
    if (firstKey === '$or') {
      return expr.$or.some(e => this._evaluate(e, context));
    }

    // Logical NOT: { "$not": expr }
    if (firstKey === '$not') {
      return !this._evaluate(expr.$not, context);
    }

    // Conditional: { "$if": [condition, thenValue, elseValue] }
    if (firstKey === '$if') {
      const [cond, thenVal, elseVal] = expr.$if;
      return this._evaluate(cond, context)
        ? this._evaluate(thenVal, context)
        : this._evaluate(elseVal, context);
    }

    // String concatenation: { "$concat": [str1, str2, ...] }
    if (firstKey === '$concat') {
      return expr.$concat
        .map(v => String(this._evaluate(v, context)))
        .join('');
    }

    // Array operations
    if (firstKey === '$map') {
      const arr = this._evaluate(expr.$map.array, context);
      const itemVar = expr.$map.as || 'item';
      return arr.map(item => {
        const newContext = { ...context, [itemVar]: item };
        return this._evaluate(expr.$map.expr, newContext);
      });
    }

    if (firstKey === '$filter') {
      const arr = this._evaluate(expr.$filter.array, context);
      const itemVar = expr.$filter.as || 'item';
      return arr.filter(item => {
        const newContext = { ...context, [itemVar]: item };
        return this._evaluate(expr.$filter.condition, newContext);
      });
    }

    // Regular object - evaluate all values
    const result = {};
    for (const key of keys) {
      result[key] = this._evaluate(expr[key], context);
    }
    return result;
  }

  /**
   * Get variable from context
   * @private
   */
  static _getVar(path, context) {
    const parts = path.split('.');
    let value = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Check if expression is JSONLex
   */
  static isJSONLex(expr) {
    return expr && typeof expr === 'object' && expr.__jsonlex === true;
  }
}

module.exports = JSONLex;

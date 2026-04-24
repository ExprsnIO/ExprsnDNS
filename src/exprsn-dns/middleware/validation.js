/**
 * Exprsn DNS - Joi validation middleware
 */

function validate(schema, key = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[key], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request payload',
        details: error.details.map((d) => ({ path: d.path, message: d.message }))
      });
    }
    req[key] = value;
    return next();
  };
}

module.exports = { validate };

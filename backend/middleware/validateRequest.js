/**
 * Joi validation middleware
 * Validates request body, params, and query against provided schemas
 * Returns 400 with field-level error messages on validation failure
 */

const validateRequest = (options = {}) => {
  const {
    bodySchema,
    paramsSchema,
    querySchema,
  } = options;

  return (req, res, next) => {
    const errors = {};

    // Validate request body
    if (bodySchema) {
      const { error, value } = bodySchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        error.details.forEach((detail) => {
          const fieldName = detail.path.join('.');
          if (!errors[fieldName]) {
            errors[fieldName] = [];
          }
          errors[fieldName].push(detail.message);
        });
      } else {
        // Replace body with validated and sanitized data
        req.body = value;
      }
    }

    // Validate request params
    if (paramsSchema) {
      const { error, value } = paramsSchema.validate(req.params, {
        abortEarly: false,
        stripUnknown: false,
      });

      if (error) {
        error.details.forEach((detail) => {
          const fieldName = `params.${detail.path.join('.')}`;
          if (!errors[fieldName]) {
            errors[fieldName] = [];
          }
          errors[fieldName].push(detail.message);
        });
      } else {
        req.params = value;
      }
    }

    // Validate request query
    if (querySchema) {
      const { error, value } = querySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        error.details.forEach((detail) => {
          const fieldName = `query.${detail.path.join('.')}`;
          if (!errors[fieldName]) {
            errors[fieldName] = [];
          }
          errors[fieldName].push(detail.message);
        });
      } else {
        req.query = value;
      }
    }

    // If there are validation errors, return 400 with field-level errors
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors,
      });
    }

    // All validations passed, proceed to next middleware/controller
    next();
  };
};

module.exports = { validateRequest };

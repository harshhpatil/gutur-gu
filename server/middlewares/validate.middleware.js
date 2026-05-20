// validation middleware to validate the incoming request body against the provided JOI schema and return appropriate error if the validation fails

const validate = (schema) => {
  return (req, res, next) => {
    // validating the request body against the provided schema and collecting all errors if any
    const { error } = schema.validate(req.body, { abortEarly: false });

    // if there are validation errors, extracting the error messages and sending them in the response with 400 status code
    if (error) {
      const errors = error.details.map((detail) => detail.message);
      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    next();
  };
};

export default validate;// exporting the validation middleware function

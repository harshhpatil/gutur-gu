import Joi from "joi";

//  validation schema for user login containing email and password containing the specified requirements
export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// validation schema for user registration containing email and password with the specified requirements
export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  displayName: Joi.string().trim().min(1).max(100).required(),
  password: Joi.string()
    .min(8)
    .pattern(/[A-Z]/)
    .pattern(/[a-z]/)
    .pattern(/[0-9]/)
    .pattern(/[!@#$%^&*]/) 
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.base":
        "Password must contain uppercase, lowercase, number and special character",
    }),
});

// validation schema for user password change containing old password and new password with specified requirements
export const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .pattern(/[A-Z]/)
    .pattern(/[a-z]/)
    .pattern(/[0-9]/)
    .pattern(/[!@#$%^&*]/)
    .required()
    .messages({
      "string.min": "New password must be at least 8 characters",
      "string.pattern.base":
      "New password must contain uppercase, lowercase, number and special character",
    }),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .pattern(/[A-Z]/)
    .pattern(/[a-z]/)
    .pattern(/[0-9]/)
    .pattern(/[!@#$%^&*]/)
    .required()
    .messages({
      "string.min": "New password must be at least 8 characters",
      "string.pattern.base":
        "New password must contain uppercase, lowercase, number and special character",
    }),
});

export const pairingCodeSchema = Joi.object({
  pairingCode: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.pattern.base": "Pairing code must be a 6 digit number",
    }),
});

export const scheduleSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required()
    .messages({
      "string.pattern.base": "Time must use HH:mm 24-hour format",
    }),
  timezone: Joi.string().trim().min(1).max(100).optional(),
  isActive: Joi.boolean().optional(),
});

/**
 * ═══════════════════════════════════════════════════════════
 * Password Service
 * Enhanced password validation and policies
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../config');
const { AppError } = require('@exprsn/shared');

/**
 * Password strength levels
 */
const PasswordStrength = {
  VERY_WEAK: 0,
  WEAK: 1,
  FAIR: 2,
  GOOD: 3,
  STRONG: 4,
  VERY_STRONG: 5
};

/**
 * Common weak passwords (subset - in production, use a larger list)
 */
const COMMON_WEAK_PASSWORDS = [
  'password', 'password123', '12345678', '123456789', 'qwerty',
  'abc123', 'letmein', 'welcome', 'monkey', '1234567890',
  'admin', 'administrator', 'root', 'user', 'guest'
];

/**
 * Check if password meets minimum requirements
 * @param {string} password
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validatePassword(password) {
  const errors = [];
  const minLength = config.security.passwordMinLength || 12;

  // Check minimum length
  if (!password || password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  // Check for uppercase letters
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase letters
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for numbers
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for special characters
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak passwords
  const lowerPassword = password.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.some(weak => lowerPassword.includes(weak))) {
    errors.push('Password is too common or contains common weak patterns');
  }

  // Check for sequential characters
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password should not contain repeating characters (e.g., "aaa", "111")');
  }

  // Check for sequential patterns
  if (
    /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password) ||
    /(?:012|123|234|345|456|567|678|789)/.test(password)
  ) {
    errors.push('Password should not contain sequential characters (e.g., "abc", "123")');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate password strength score
 * @param {string} password
 * @returns {object} { score: number, strength: string, feedback: string[] }
 */
function calculatePasswordStrength(password) {
  if (!password) {
    return {
      score: PasswordStrength.VERY_WEAK,
      strength: 'Very Weak',
      feedback: ['Password is required']
    };
  }

  let score = 0;
  const feedback = [];

  // Length scoring
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;

  // Character variety scoring
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score += 1;
    feedback.push('Good: Contains both uppercase and lowercase letters');
  } else if (/[a-z]/.test(password) || /[A-Z]/.test(password)) {
    feedback.push('Add both uppercase and lowercase letters for better security');
  }

  if (/\d/.test(password)) {
    score += 1;
    feedback.push('Good: Contains numbers');
  } else {
    feedback.push('Add numbers for better security');
  }

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
    feedback.push('Good: Contains special characters');
  } else {
    feedback.push('Add special characters for better security');
  }

  // Complexity scoring
  const uniqueChars = new Set(password).size;
  if (uniqueChars / password.length > 0.6) {
    score += 1;
    feedback.push('Good: High character diversity');
  }

  // Penalties
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeating characters');
  }

  if (COMMON_WEAK_PASSWORDS.some(weak => password.toLowerCase().includes(weak))) {
    score -= 2;
    feedback.push('Warning: Contains common weak patterns');
  }

  // Normalize score to 0-5 range
  score = Math.max(0, Math.min(5, score));

  // Determine strength label
  let strength;
  switch (score) {
    case 0:
    case 1:
      strength = 'Very Weak';
      break;
    case 2:
      strength = 'Weak';
      break;
    case 3:
      strength = 'Fair';
      break;
    case 4:
      strength = 'Good';
      break;
    case 5:
      strength = 'Very Strong';
      break;
    default:
      strength = 'Unknown';
  }

  return {
    score,
    strength,
    feedback,
    percentage: (score / 5) * 100
  };
}

/**
 * Check if new password is different enough from old password
 * @param {string} newPassword
 * @param {string} oldPassword
 * @returns {boolean}
 */
function isDifferentEnough(newPassword, oldPassword) {
  if (!oldPassword) return true;

  // Check if passwords are exactly the same
  if (newPassword === oldPassword) {
    return false;
  }

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(newPassword, oldPassword);

  // Require at least 3 character changes
  return distance >= 3;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1
 * @param {string} str2
 * @returns {number}
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Generate a strong random password
 * @param {number} length - Password length (default: 16)
 * @returns {string}
 */
function generatePassword(length = 16) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = uppercase + lowercase + numbers + special;

  // Ensure at least one of each type
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Validate and throw error if password doesn't meet requirements
 * @param {string} password
 * @throws {AppError}
 */
function validatePasswordOrThrow(password) {
  const result = validatePassword(password);

  if (!result.valid) {
    throw new AppError(
      `Password does not meet requirements: ${result.errors.join(', ')}`,
      400,
      'WEAK_PASSWORD',
      { errors: result.errors }
    );
  }
}

module.exports = {
  PasswordStrength,
  validatePassword,
  calculatePasswordStrength,
  isDifferentEnough,
  generatePassword,
  validatePasswordOrThrow
};

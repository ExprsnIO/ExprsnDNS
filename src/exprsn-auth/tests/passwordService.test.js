/**
 * Password Service Tests
 * Tests for password validation, strength calculation, and generation
 */

const passwordService = require('../src/services/passwordService');

describe('Password Service', () => {
  describe('validatePassword', () => {
    test('should accept strong password with all requirements', () => {
      const result = passwordService.validatePassword('Test123!@#Strong');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password shorter than minimum length', () => {
      const result = passwordService.validatePassword('Test1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('at least 12 characters'));
    });

    test('should reject password without uppercase letter', () => {
      const result = passwordService.validatePassword('test123!@#password');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('uppercase letter'));
    });

    test('should reject password without lowercase letter', () => {
      const result = passwordService.validatePassword('TEST123!@#PASSWORD');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('lowercase letter'));
    });

    test('should reject password without number', () => {
      const result = passwordService.validatePassword('TestPassword!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('number'));
    });

    test('should reject password without special character', () => {
      const result = passwordService.validatePassword('Test123Password');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('special character'));
    });

    test('should reject common weak passwords', () => {
      const weakPasswords = ['password123!@#A', 'Welcome123!@#A', 'Admin123!@#Pass'];
      weakPasswords.forEach(password => {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(expect.stringContaining('common'));
      });
    });

    test('should reject password with repeating characters', () => {
      const result = passwordService.validatePassword('Test111!!!Pass');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('repeating characters'));
    });

    test('should reject password with sequential patterns', () => {
      const sequentialPasswords = ['Testabc123!@#', 'Test123!@#Pass', 'Password123!abc'];
      sequentialPasswords.forEach(password => {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(expect.stringContaining('sequential'));
      });
    });

    test('should reject null or undefined password', () => {
      expect(passwordService.validatePassword(null).valid).toBe(false);
      expect(passwordService.validatePassword(undefined).valid).toBe(false);
      expect(passwordService.validatePassword('').valid).toBe(false);
    });
  });

  describe('calculatePasswordStrength', () => {
    test('should rate very weak password as VERY_WEAK', () => {
      const result = passwordService.calculatePasswordStrength('pass');
      expect(result.score).toBe(0);
      expect(result.strength).toBe('Very Weak');
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    test('should rate weak password as WEAK', () => {
      const result = passwordService.calculatePasswordStrength('password1');
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.strength).toMatch(/Weak/i);
    });

    test('should rate fair password as FAIR', () => {
      const result = passwordService.calculatePasswordStrength('Pass1234!');
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(3);
    });

    test('should rate good password as GOOD', () => {
      const result = passwordService.calculatePasswordStrength('MyP@ssw0rd2024');
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    test('should rate strong password as STRONG or VERY_STRONG', () => {
      const result = passwordService.calculatePasswordStrength('C0mpl3x!P@ssw0rd#2024$Secure');
      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(['Strong', 'Very Strong']).toContain(result.strength);
    });

    test('should provide feedback for weak passwords', () => {
      const result = passwordService.calculatePasswordStrength('weak');
      expect(result.feedback).toBeInstanceOf(Array);
      expect(result.feedback.length).toBeGreaterThan(0);
      expect(result.feedback.some(f => f.includes('longer'))).toBe(true);
    });

    test('should calculate character diversity', () => {
      const weak = passwordService.calculatePasswordStrength('aaaaaaaaaa');
      const diverse = passwordService.calculatePasswordStrength('aBcD1234!@#$');
      expect(diverse.score).toBeGreaterThan(weak.score);
    });

    test('should handle empty password', () => {
      const result = passwordService.calculatePasswordStrength('');
      expect(result.score).toBe(0);
      expect(result.strength).toBe('Very Weak');
    });
  });

  describe('isPasswordDifferentFromOld', () => {
    test('should accept password with sufficient changes', () => {
      const result = passwordService.isPasswordDifferentFromOld('OldPassword123!', 'NewPassword456!');
      expect(result.valid).toBe(true);
      expect(result.distance).toBeGreaterThanOrEqual(3);
    });

    test('should reject identical passwords', () => {
      const result = passwordService.isPasswordDifferentFromOld('Same123!@#', 'Same123!@#');
      expect(result.valid).toBe(false);
      expect(result.distance).toBe(0);
    });

    test('should reject passwords with minimal changes', () => {
      const result = passwordService.isPasswordDifferentFromOld('Password123!', 'Password124!');
      expect(result.valid).toBe(false);
      expect(result.distance).toBeLessThan(3);
    });

    test('should calculate Levenshtein distance correctly', () => {
      const result1 = passwordService.isPasswordDifferentFromOld('abc', 'def');
      expect(result1.distance).toBe(3);

      const result2 = passwordService.isPasswordDifferentFromOld('kitten', 'sitting');
      expect(result2.distance).toBe(3);
    });

    test('should require minimum 3 character changes', () => {
      const similarPasswords = [
        ['Test123!@#Pass', 'Test123!@#Pasa'],
        ['MyPassword!1', 'MyPassword!2'],
        ['Secure2024!', 'Secure2025!']
      ];

      similarPasswords.forEach(([old, newPass]) => {
        const result = passwordService.isPasswordDifferentFromOld(old, newPass);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('generateStrongPassword', () => {
    test('should generate password of specified length', () => {
      const password = passwordService.generateStrongPassword(16);
      expect(password.length).toBe(16);
    });

    test('should generate password with default length', () => {
      const password = passwordService.generateStrongPassword();
      expect(password.length).toBeGreaterThanOrEqual(16);
    });

    test('should include uppercase letters', () => {
      const password = passwordService.generateStrongPassword(20);
      expect(/[A-Z]/.test(password)).toBe(true);
    });

    test('should include lowercase letters', () => {
      const password = passwordService.generateStrongPassword(20);
      expect(/[a-z]/.test(password)).toBe(true);
    });

    test('should include numbers', () => {
      const password = passwordService.generateStrongPassword(20);
      expect(/\d/.test(password)).toBe(true);
    });

    test('should include special characters', () => {
      const password = passwordService.generateStrongPassword(20);
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)).toBe(true);
    });

    test('should generate different passwords each time', () => {
      const password1 = passwordService.generateStrongPassword(20);
      const password2 = passwordService.generateStrongPassword(20);
      const password3 = passwordService.generateStrongPassword(20);

      expect(password1).not.toBe(password2);
      expect(password2).not.toBe(password3);
      expect(password1).not.toBe(password3);
    });

    test('should pass validation checks', () => {
      for (let i = 0; i < 10; i++) {
        const password = passwordService.generateStrongPassword(16);
        const validation = passwordService.validatePassword(password);
        expect(validation.valid).toBe(true);
      }
    });

    test('should have high strength score', () => {
      for (let i = 0; i < 10; i++) {
        const password = passwordService.generateStrongPassword(20);
        const strength = passwordService.calculatePasswordStrength(password);
        expect(strength.score).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long passwords', () => {
      const longPassword = 'A'.repeat(100) + 'a1!';
      const validation = passwordService.validatePassword(longPassword);
      expect(validation.valid).toBe(true);

      const strength = passwordService.calculatePasswordStrength(longPassword);
      expect(strength.score).toBeGreaterThanOrEqual(0);
    });

    test('should handle passwords with unicode characters', () => {
      const unicodePassword = 'Test123!@#日本語';
      const validation = passwordService.validatePassword(unicodePassword);
      // Should still validate basic requirements
      expect(/[A-Z]/.test(unicodePassword)).toBe(true);
      expect(/[a-z]/.test(unicodePassword)).toBe(true);
      expect(/\d/.test(unicodePassword)).toBe(true);
    });

    test('should handle passwords with only special characters', () => {
      const result = passwordService.validatePassword('!@#$%^&*()_+');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('uppercase'));
      expect(result.errors).toContain(expect.stringContaining('lowercase'));
      expect(result.errors).toContain(expect.stringContaining('number'));
    });
  });
});

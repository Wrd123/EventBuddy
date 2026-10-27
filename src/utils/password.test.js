import { MIN_PASSWORD_LENGTH, newPasswordProblem } from './password';

describe('newPasswordProblem', () => {
  it('matches the server minimum', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('accepts a long enough password typed the same twice', () => {
    expect(newPasswordProblem('correct horse', 'correct horse')).toBe('');
  });

  it('catches a mistyped confirmation first', () => {
    expect(newPasswordProblem('short', 'shorts')).toBe('Passwords do not match');
  });

  it('catches a password under the minimum', () => {
    expect(newPasswordProblem('seven77', 'seven77')).toBe('Password must be at least 8 characters');
  });
});

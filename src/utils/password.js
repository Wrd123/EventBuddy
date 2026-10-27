// The app's side of the server's password rule (server/src/validation.js),
// so a new password that's too short or mistyped is caught before sending.
// The server has the final say, including turning down common passwords.
export const MIN_PASSWORD_LENGTH = 8;

// A new password and its confirmation -> the first problem, or ''
export const newPasswordProblem = (password, confirmation) => {
  if (password !== confirmation) return 'Passwords do not match';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return '';
};

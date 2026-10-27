// Passwords of 8 or more characters that turn up near the top of every
// leaked-password list, so they're the first an attacker tries. Shorter
// ones are already refused by the length rule. Checked here rather than
// against an online breach service, so a password never leaves the server.
// Lowercase; compared without regard to case.
module.exports = new Set([
  '12345678', '123456789', '1234567890', '0123456789', '11111111', '00000000',
  '87654321', '12341234', '11223344', '123123123', '147258369', '987654321',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
  'qwertyui', 'qwerty12', 'qwerty123', 'qwertyuiop', '1q2w3e4r', '1qaz2wsx',
  'asdfghjk', 'asdfasdf', 'zxcvbnm1', 'abcd1234', 'abc12345', 'abcdefgh',
  'iloveyou', 'iloveyou1', 'sunshine', 'princess', 'football', 'baseball',
  'basketball', 'superman', 'starwars', 'whatever', 'trustno1', 'letmein1',
  'welcome1', 'welcome123', 'changeme', 'computer', 'internet', 'michelle',
  'jennifer', 'charlie1', 'liverpool', 'chocolate', 'babygirl', 'butterfly',
  'eventbuddy', 'eventbuddy1'
]);

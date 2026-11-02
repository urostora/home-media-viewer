import bcrypt from 'bcrypt';
// Public dummy, never assigned to an account. Generated once with application cost 10.
export const LOGIN_DUMMY_HASH = '$2b$10$/VF5OrAfI61orhC3cr6QQOgnQXTsVyQUsETmFoKsESBNRqaR9Zg0C';
export const verifyLoginPassword = async (password: string, storedHash?: string): Promise<boolean> => {
  const valid =
    typeof storedHash === 'string' && /^\$2[ab]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(storedHash);
  // bcrypt has always ignored bytes after 72. Use a Buffer to retain exact UTF-8
  // prefix semantics, including a codepoint split at that boundary.
  const prefix = Buffer.from(password, 'utf8').subarray(0, 72);
  const matched = await bcrypt.compare(prefix, valid ? storedHash! : LOGIN_DUMMY_HASH);
  return valid && matched;
};

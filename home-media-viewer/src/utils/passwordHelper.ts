import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const getHashedPassword = async (password: string): Promise<string> => await bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> =>
  await bcrypt.compare(password, hashedPassword);

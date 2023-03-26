
import bcrypt from "bcrypt";

const getHashedPassword = async (password: string) => await bcrypt.hash(password, 10);

const verifyPassword = async (password: string, hashedPassword: string) => bcrypt.compare(password, hashedPassword);

export {
    getHashedPassword,
    verifyPassword
};

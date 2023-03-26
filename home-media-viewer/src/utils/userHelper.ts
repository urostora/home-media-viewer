
import { UserAddType, UserEditType } from "@/types/api/userTypes";
import { Prisma, PrismaClient, User } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

export const getHashedPassword = async (password: string) => await bcrypt.hash(password, 10);

export const verifyPassword = async (password: string, hashedPassword: string) => bcrypt.compare(password, hashedPassword);

export const isPasswordStrong = (password: string) => {
  const regex = /^(?!.*\s)(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[~`!@#$%^&*()--+={}\[\]|\\:;"'<>,.?/_₹]).{8,16}$/;
  return regex.test(password);
}

export const checkUserData = async (data: UserEditType, currentId: string | null = null): Promise<void> => {
  const { name = null, email = null, password = null } = data;

  let uniqueFilters: Prisma.UserWhereInput[] = [];
  if (typeof name === 'string') {
    if (name.length === 0) {
      throw Error('Parameter "name" is empty');
    }
    uniqueFilters.push({ name });
  }
  if (typeof email === 'string') {
    if (email.length === 0) {
      throw Error('Parameter "email" is empty');
    }
    uniqueFilters.push({ email });
  }
  if (typeof password === 'string') {
    if (!isPasswordStrong(password)) {
      throw Error('Parameter "password" does not meet password strength requirements');
    }
  }

  let notFilter: any = {};
  if (currentId != null) {
    notFilter.id = currentId;
  }

  // check if user exists with same name or email
  if (uniqueFilters.length > 0) {
    const existingUser = await prisma.user.findFirst({
      where: {
        AND: [{
          status: {
            in: [ 'Active' /*, 'Disabled'*/ ]
          }
        }],
        OR: uniqueFilters,
        NOT: notFilter
      }
    });

    if (existingUser != null) {
      throw Error(`User with name ${name} or email ${email} already exists`);
    }
  }
}

export const addUser = async (data: UserEditType): Promise<User> => {
  const { name = null, email = null, password = null } = data;

  if (typeof name !== 'string') { throw Error('Parameter "name" is not set'); }
  if (typeof email !== 'string') { throw Error('Parameter "email" is not set'); }
  if (typeof password !== 'string') { throw Error('Parameter "password" is not set'); }

  await checkUserData(data);

  return await prisma.user.create({
    data: {
      name,
      email,
      password: await getHashedPassword(password),
    }
  });
}

export const updateUser = async (data: UserEditType) => {
  const { id = null } = data;

  if (id == null) {
    throw Error('Parameter "id" must be a non-empty string');
  }

  const user = await prisma.user.findFirst({ where: { id }});

  if (user == null) {
    throw Error(`User not found with id ${id}`);
  }

  await checkUserData(data, id);

  const { name = null, email = null, password = null } = data;
  const updateData: any = {};

  if (typeof name === 'string') {
    updateData.name = name;
  }

  if (typeof email === 'string') {
    updateData.email = email;
  }

  if (typeof password === 'string') {
    updateData.password = password;
  }

  const updatedUser = await prisma.user.update({
    where: {
      id
    },
    data: updateData
  });
}
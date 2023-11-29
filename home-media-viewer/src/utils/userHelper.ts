import { UserEditType } from '@/types/api/userTypes';
import { Prisma, User } from '@prisma/client';
import bcrypt from 'bcrypt';

import prisma from '@/utils/prisma/prismaImporter';
import { DataValidatorSchema, statusValues } from './dataValidator';
import { HmvError } from './apiHelpers';

const SALT_ROUNDS = 10;

export const getHashedPassword = async (password: string) => await bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> =>
  await bcrypt.compare(password, hashedPassword);

export const isPasswordStrong = (password: string): boolean => {
  const regex = /^(?!.*\\s)(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[~!@#$%^&*()--+={}[\\]|\\:;"'<>,.?]).{8,}$/;
  return regex.test(password);
};

export const userSearchDataSchema: DataValidatorSchema = [
  { field: 'id', isArrayAllowed: true },
  { field: 'name', isArrayAllowed: true },
  { field: 'email', isArrayAllowed: true },
  { field: 'isAdmin', type: 'boolean' },
  { field: 'status', isArrayAllowed: true, valuesAllowed: statusValues },
];

export const userAddDataSchema: DataValidatorSchema = [
  { field: 'name', isRequired: true },
  { field: 'email', isRequired: true },
  { field: 'password', isRequired: true },
  { field: 'isAdmin', type: 'boolean' },
  { field: 'status', valuesAllowed: statusValues },
];

export const userEditDataSchema: DataValidatorSchema = [
  { field: 'name' },
  { field: 'email' },
  { field: 'password' },
  { field: 'isAdmin', type: 'boolean' },
  { field: 'status', valuesAllowed: statusValues },
];

export const checkUserData = async (data: UserEditType, currentId: string | null = null): Promise<void> => {
  const { name = null, email = null, password = null } = data;

  const uniqueFilters: Prisma.UserWhereInput[] = [];
  if (typeof name === 'string') {
    if (name.length === 0) {
      throw new HmvError('Parameter "name" is empty', { isPublic: true });
    }
    uniqueFilters.push({ name });
  }
  if (typeof email === 'string') {
    if (email.length === 0) {
      throw new HmvError('Parameter "email" is empty', { isPublic: true });
    }
    uniqueFilters.push({ email });
  }
  if (typeof password === 'string') {
    if (!isPasswordStrong(password)) {
      throw new HmvError('Parameter "password" does not meet password strength requirements', { isPublic: true });
    }
  }

  const notFilter: { id?: string } = {};
  if (currentId != null) {
    notFilter.id = currentId;
  }

  // check if user exists with same name or email
  if (uniqueFilters.length > 0) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: uniqueFilters,
        NOT: notFilter,
      },
    });

    if (existingUser != null) {
      throw new HmvError(`User with name ${name} or email ${email} already exists`, { isPublic: true });
    }
  }
};

export const addUser = async (data: UserEditType): Promise<User> => {
  const { name = null, email = null, password = null, isAdmin = null } = data;

  if (typeof name !== 'string') {
    throw new HmvError('Parameter "name" is not set', { isPublic: true });
  }
  if (typeof email !== 'string') {
    throw new HmvError('Parameter "email" is not set', { isPublic: true });
  }
  if (typeof password !== 'string') {
    throw new HmvError('Parameter "password" is not set', { isPublic: true });
  } else if (!isPasswordStrong(password)) {
    throw new HmvError('Parameter "password" does not match strength requirements', { isPublic: true });
  }

  await checkUserData(data);

  return await prisma.user.create({
    data: {
      name,
      email,
      password: await getHashedPassword(password),
      isAdmin: isAdmin ?? false,
    },
  });
};

export const updateUser = async (id: string, data: UserEditType): Promise<User> => {
  if (typeof id !== 'string') {
    throw Error('Parameter "id" must be a non-empty string');
  }

  const user = await prisma.user.findFirst({ where: { id } });

  if (user == null) {
    throw Error(`User not found with id ${id}`);
  }

  await checkUserData(data, id);

  const { name = null, email = null, password = null, isAdmin = null, status = null } = data;
  const updateData: UserEditType = {};

  if (typeof name === 'string') {
    updateData.name = name;
  }

  if (typeof email === 'string') {
    updateData.email = email;
  }

  if (typeof password === 'string') {
    const hashedPassword = await getHashedPassword(password);
    updateData.password = hashedPassword;
  }

  if (typeof status === 'string') {
    updateData.status = status;
  }

  if (typeof isAdmin === 'boolean') {
    updateData.isAdmin = isAdmin;
  }

  return await prisma.user.update({
    where: {
      id,
    },
    data: updateData,
  });
};

export const deleteUser = async (id: string) => {
  const user = await prisma.user.findFirst({ where: { id, status: { in: ['Active', 'Disabled'] } } });

  if (user == null) {
    throw new HmvError(`User not found with id ${id}`, { isPublic: true });
  }

  await prisma.user.update({ where: { id }, data: { status: 'Deleted' } });
};

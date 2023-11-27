import { UserEditType } from '@/types/api/userTypes';
import { $Enums, Prisma, User } from '@prisma/client';
import bcrypt from 'bcrypt';

import prisma from '@/utils/prisma/prismaImporter';

export const getHashedPassword = async (password: string) => await bcrypt.hash(password, 10);

export const verifyPassword = async (password: string, hashedPassword: string) =>
  bcrypt.compare(password, hashedPassword);

export const isPasswordStrong = (password: string) => {
  const regex = /^(?!.*\s)(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[~`!@#$%^&*()--+={}[\]|\\:;"'<>,.?/_₹]).{8,}$/;
  return regex.test(password);
};

export const checkUserData = async (data: UserEditType, currentId: string | null = null): Promise<void> => {
  const { name = null, email = null, password = null, status = null } = data;

  const uniqueFilters: Prisma.UserWhereInput[] = [];
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

  const notFilter: { id?: string } = {};
  if (currentId != null) {
    notFilter.id = currentId;
  }

  let statusFilter: $Enums.Status[] = ['Active', 'Disabled'];
  if (typeof status === 'string') {
    statusFilter = [status];
  } else if (Array.isArray(status)) {
    statusFilter = status;
  }

  // check if user exists with same name or email
  if (uniqueFilters.length > 0) {
    const existingUser = await prisma.user.findFirst({
      where: {
        AND: [
          {
            status: {
              in: statusFilter,
            },
          },
        ],
        OR: uniqueFilters,
        NOT: notFilter,
      },
    });

    if (existingUser != null) {
      throw Error(`User with name ${name} or email ${email} already exists`);
    }
  }
};

export const addUser = async (data: UserEditType): Promise<User> => {
  const { name = null, email = null, password = null, isAdmin = null } = data;

  if (typeof name !== 'string') {
    throw Error('Parameter "name" is not set');
  }
  if (typeof email !== 'string') {
    throw Error('Parameter "email" is not set');
  }
  if (typeof password !== 'string') {
    throw Error('Parameter "password" is not set');
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

export const updateUser = async (data: UserEditType) => {
  const { id = null } = data;

  if (id == null) {
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

  await prisma.user.update({
    where: {
      id,
    },
    data: updateData,
  });
};

export const deleteUser = async (id: string) => {
  const user = await prisma.user.findFirst({ where: { id, status: { in: ['Active', 'Disabled'] } } });

  if (user == null) {
    throw Error(`User not found with id ${id}`);
  }

  await prisma.user.update({ where: { id }, data: { status: 'Deleted' } });
};

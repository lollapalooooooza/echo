import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;

const userProfileSelect = {
  id: true,
  name: true,
  username: true,
  bio: true,
  email: true,
  image: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

export type UserProfile = Prisma.UserGetPayload<{ select: typeof userProfileSelect }>;

type AuthUserInput = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type UserProfileUpdateInput = {
  name?: string;
  username?: string;
  bio?: string;
};

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

function baseUsernameSeed(user: Pick<AuthUserInput, "name" | "email" | "id">) {
  const emailSeed = user.email?.split("@")[0];
  const raw = user.name?.trim() || emailSeed || `user-${user.id.slice(0, 8)}`;
  const normalized = normalizeUsername(raw);

  if (normalized.length >= USERNAME_MIN_LENGTH) {
    return normalized;
  }

  return `user-${user.id.slice(0, 8)}`;
}

async function generateUniqueUsername(user: Pick<AuthUserInput, "name" | "email" | "id">, excludeUserId?: string) {
  const seed = baseUsernameSeed(user);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `${attempt + 1}`;
    const maxBaseLength = USERNAME_MAX_LENGTH - suffix.length;
    const candidate = `${seed.slice(0, Math.max(USERNAME_MIN_LENGTH, maxBaseLength))}${suffix}`;

    const existing = await db.user.findFirst({
      where: {
        username: candidate,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  return `user-${user.id.slice(0, 8)}`;
}

export async function ensureUserProfile(user: AuthUserInput) {
  const existing = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      username: true,
    },
  });

  const data: Prisma.UserUncheckedUpdateInput = {
    lastLoginAt: new Date(),
  };

  if (user.name !== undefined) data.name = user.name;
  if (user.email !== undefined) data.email = user.email;
  if (user.image !== undefined) data.image = user.image;

  if (!existing?.username) {
    data.username = await generateUniqueUsername(user, user.id);
  }

  if (!existing) {
    return db.user.create({
      data: {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        username: data.username as string,
        lastLoginAt: data.lastLoginAt as Date,
      },
      select: userProfileSelect,
    });
  }

  return db.user.update({
    where: { id: user.id },
    data,
    select: userProfileSelect,
  });
}

export async function getUserProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: userProfileSelect,
  });

  if (!user) return null;

  if (user.username) return user;

  return ensureUserProfile({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  });
}

export async function updateUserProfile(userId: string, input: UserProfileUpdateInput) {
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  if (!existing) {
    throw new Error("User not found");
  }

  const data: Prisma.UserUncheckedUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length > 80) throw new Error("Name must be 80 characters or fewer");
    data.name = name || null;
  }

  if (input.bio !== undefined) {
    const bio = input.bio.trim();
    if (bio.length > 280) throw new Error("Bio must be 280 characters or fewer");
    data.bio = bio || null;
  }

  if (input.username !== undefined) {
    const username = normalizeUsername(input.username);
    if (username.length < USERNAME_MIN_LENGTH) {
      throw new Error("Username must be at least 3 characters and use only letters, numbers, hyphens, or underscores");
    }

    const taken = await db.user.findFirst({
      where: {
        username,
        id: { not: userId },
      },
      select: { id: true },
    });

    if (taken) {
      throw new Error("That username is already taken");
    }

    data.username = username;
  }

  return db.user.update({
    where: { id: userId },
    data,
    select: userProfileSelect,
  });
}

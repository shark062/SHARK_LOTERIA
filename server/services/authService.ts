import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { storage } from '../storage';

const JWT_SECRET = process.env.JWT_SECRET || 'shark-loterias-secret-key-change-in-production';
const JWT_EXPIRY = '30d';

export interface AuthToken {
  userId: string;
  email: string;
  role: 'FREE' | 'PREMIUM';
  iat: number;
  exp: number;
}

export class AuthService {
  async registerUser(email: string, password: string, firstName: string) {
    // Check if user exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await storage.createUser({
      email,
      password: hashedPassword,
      firstName: firstName || email.split('@')[0],
      role: 'FREE',
    });

    // Generate JWT
    const token = this.generateToken(user.id, user.email, user.role);
    return { user, token };
  }

  async loginUser(email: string, password: string) {
    const user = await storage.getUserByEmail(email);
    if (!user || !user.password) {
      throw new Error('Invalid email or password');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    const token = this.generateToken(user.id, user.email, user.role);
    return { user, token };
  }

  async upgradeUserToPremium(userId: string, months: number = 1) {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + months);

    const updatedUser = await storage.updateUser(userId, {
      role: 'PREMIUM',
      subscriptionExpires: expiryDate,
    });

    return updatedUser;
  }

  generateToken(userId: string, email: string, role: string): string {
    return jwt.sign(
      { userId, email, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
  }

  verifyToken(token: string): AuthToken {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthToken;
      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

export const authService = new AuthService();

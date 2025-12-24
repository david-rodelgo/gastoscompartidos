
export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export interface Family {
  id: string;
  name: string;
  memberCount: number;
  role: Role;
}

export interface Expense {
  id: string;
  concept: string;
  amount: number;
  familyId: string;
  date: string;
  imageUrl?: string;
}

export interface TripGroup {
  id: string;
  name: string;
  families: Family[];
  expenses: Expense[];
  adminId: string; // The family ID that created the group
  settledTransfers?: string[]; // Array of strings like "fromId-toId-amount"
}

export type SplitMethod = 'BY_MEMBER' | 'BY_PERCENTAGE';

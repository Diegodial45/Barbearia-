export enum UserRole {
  CLIENT = 'CLIENT',
  BARBER = 'BARBER',
  NONE = 'NONE'
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  image: string;
}

export interface Review {
  rating: number; // 1 to 5
  comment: string;
  date: string;
}

export interface Booking {
  id: string;
  serviceId: string;
  serviceName: string; // Denormalized for easier display
  customerName: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: 'confirmed' | 'cancelled' | 'completed';
  aiConfirmationMessage?: string;
  review?: Review;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface ShopSettings {
  name: string;
  tagline: string;
}
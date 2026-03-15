// Household Knowledge extension types

export interface HouseholdItem {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  details: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseholdVendor {
  id: string;
  name: string;
  service_type: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  rating: number | null;
  last_used: string | null;
  created_at: string;
}

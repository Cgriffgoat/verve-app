export type Activity = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  score: number;
  imageUrl: string;
  distance: string;
  commitment: string;
  weather?: string;
  good_for?: string[];
  priceLevel?: '$' | '$$' | '$$$' | null;
  allowsDogs?: boolean | null;
  hasLiveMusic?: boolean | null;
};

export type Review = {
  id: string;
  activity_id: string;
  user_id: string;
  score: number;
  review_text: string;
  photos: string[];
  vibe: number;
  value_score: number;
  would_return: number;
  crowd_level: number;
  descriptors: string[];
  helpful_count: number;
  reviewer_name: string | null;
  created_at: string;
};

export type Category = 'hike' | 'bike' | 'run' | 'ski';

export interface LatLng {
  lat: number;
  lon: number;
}

export interface Bounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** Метаданные трека, вводимые и редактируемые пользователем. */
export interface TrackMetaInput {
  districtId: string;
  category: Category;
  name: string;
  description?: string;
}

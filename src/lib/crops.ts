export const CROPS = [
  { id: "pomegranate", label: "Pomegranate", emoji: "🍎" },
  { id: "tomato", label: "Tomato", emoji: "🍅" },
  { id: "wheat", label: "Wheat", emoji: "🌾" },
  { id: "cotton", label: "Cotton", emoji: "🌱" },
  { id: "potato", label: "Potato", emoji: "🥔" },
] as const;

export type CropId = (typeof CROPS)[number]["id"];

export function isCropId(value: string): value is CropId {
  return CROPS.some((crop) => crop.id === value);
}

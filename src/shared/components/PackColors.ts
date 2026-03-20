export const PACK_COLORS = [
  '#3F51B5', // indigo (nav)
  '#4CAF50', // green
  '#F44336', // red
  '#FFC107', // amber
  '#9C27B0', // purple
  '#00BCD4', // cyan
  '#FF5722', // deep orange
  '#607D8B', // blue grey
  '#E91E63', // pink
  '#009688', // teal
];

export function getPackColorStyle(color: string) {
  return { backgroundColor: color + '20', borderColor: color + '60', color };
}

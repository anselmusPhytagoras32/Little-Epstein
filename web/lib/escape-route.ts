export type RoutePoint = { x: number; y: number };

// The trail winds across the island, with each day spaced for a phone-sized target.
export const ROUTE_HEIGHT = 6000;
const routeColumns = [230, 420, 670, 790, 650, 390, 220, 280, 510, 740, 760, 520, 270, 210, 400, 660, 790, 630, 370, 210, 300, 560, 790, 710, 490, 250, 210, 410, 660, 760];
const trail: RoutePoint[] = [{ x: 200, y: 5860 }, ...routeColumns.map((x, index) => ({ x, y: 5650 - index * 180 }))];

function controls(index: number): [RoutePoint, RoutePoint] {
  const previous = trail[Math.max(0, index - 1)];
  const from = trail[index];
  const to = trail[index + 1];
  const next = trail[Math.min(trail.length - 1, index + 2)];
  return [
    { x: from.x + (to.x - previous.x) / 6, y: from.y + (to.y - previous.y) / 6 },
    { x: to.x - (next.x - from.x) / 6, y: to.y - (next.y - from.y) / 6 },
  ];
}

export function routePoint(day: number): RoutePoint {
  const progress = Math.min(30, Math.max(0, day));
  const segment = Math.min(29, Math.floor(progress));
  const t = progress - segment;
  const from = trail[segment];
  const to = trail[segment + 1];
  const [first, second] = controls(segment);
  const coordinate = (axis: keyof RoutePoint) => (1 - t) ** 3 * from[axis] + 3 * (1 - t) ** 2 * t * first[axis] + 3 * (1 - t) * t ** 2 * second[axis] + t ** 3 * to[axis];
  return { x: coordinate("x"), y: coordinate("y") };
}

function pathThrough(end: number): string {
  const parts = [`M${trail[0].x},${trail[0].y}`];
  for (let index = 0; index < end; index += 1) {
    const [first, second] = controls(index);
    const target = trail[index + 1];
    parts.push(`C${first.x.toFixed(1)},${first.y.toFixed(1)} ${second.x.toFixed(1)},${second.y.toFixed(1)} ${target.x},${target.y}`);
  }
  return parts.join(" ");
}

export const ROUTE_PATH = pathThrough(30);

/** The saved trail ends at the actual checkpoint, even when segments differ in length. */
export function routePathTo(day: number): string {
  const end = Math.min(30, Math.max(0, Math.floor(day)));
  return pathThrough(end);
}

export const LANDMARKS = [
  { day: 1, name: "The waterline", description: "Every escape begins with one honest day. Plant your first flag on the shore." },
  { day: 5, name: "Palm passage", description: "A small routine is taking root. Five honest days bring you into the palms." },
  { day: 9, name: "The hidden trail", description: "Stay on the path. Your crew is finding its rhythm, one day at a time." },
  { day: 13, name: "Timber crossing", description: "Cross the river with your streak intact. The far bank is getting closer." },
  { day: 17, name: "Riverbend camp", description: "More than halfway there. Keep your next check-in simple and honest." },
  { day: 21, name: "The old lookout", description: "Three weeks of showing up. Look back at the ground you have covered." },
  { day: 25, name: "Lighthouse climb", description: "The harbor is in sight. Five final days stand between you and the boat." },
  { day: 30, name: "The escape boat", description: "Thirty honest days. Everyone still standing escapes together." },
] as const;

export function landmarkForDay(day: number) {
  return LANDMARKS.find(landmark => landmark.day === day) ?? {
    day,
    name: "A little further",
    description: `Day ${day} is another small step toward the harbor. Check in honestly before your room's midnight.`,
  };
}

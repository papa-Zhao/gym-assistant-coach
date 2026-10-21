/** One exercise drawing. Every string is an SVG path `d`; coordinates live in a 116x112 box. */
export interface Pose {
  /** Equipment (bench, rack, belt...). */
  equipment: string[];
  /** Weights the person moves (bar, handle...). */
  load?: string[];
  /** Head centre. */
  head: [number, number];
  /** The person. */
  body: string;
  /** Direction-of-movement arrow. */
  arrow: string;
}

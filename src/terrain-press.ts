export interface TerrainPointer {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}
export interface TerrainPress {
  x: number;
  y: number;
  longPress: boolean;
}

/** A stationary touch held for half a second lowers once on release, never while panning. */
export class TerrainPressTracker {
  private readonly pointers = new Set<number>();
  private press: (TerrainPress & { id: number; time: number; touch: boolean }) | null = null;
  begin(event: TerrainPointer, now: number): void {
    this.pointers.add(event.pointerId);
    if (this.pointers.size !== 1) {
      this.press = null;
      return;
    }
    this.press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: now,
      touch: event.pointerType === 'touch',
      longPress: false,
    };
  }
  move(event: TerrainPointer): void {
    if (
      this.press?.id === event.pointerId &&
      Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 5
    )
      this.press = null;
  }
  finish(event: TerrainPointer, now: number): TerrainPress | null {
    this.move(event);
    this.pointers.delete(event.pointerId);
    if (!this.press || this.press.id !== event.pointerId) return null;
    const press = this.press;
    this.press = null;
    return { x: press.x, y: press.y, longPress: press.touch && now - press.time >= 500 };
  }
  cancelPointer(pointerId: number): void {
    this.pointers.delete(pointerId);
    this.press = null;
  }
  cancel(): void {
    this.press = null;
    this.pointers.clear();
  }
}

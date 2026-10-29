/** Capture the primary pointer so minimap navigation continues outside its bounds until release. */
export function bindMinimapNavigation(
  canvas: HTMLElement,
  navigate: (event: PointerEvent) => void,
): () => void {
  let pointer: number | null = null;
  const view = canvas.ownerDocument.defaultView;
  function stop(): void {
    const previous = pointer;
    pointer = null;
    if (previous !== null && canvas.hasPointerCapture(previous))
      canvas.releasePointerCapture(previous);
  }
  function down(event: PointerEvent): void {
    if (event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    event.stopPropagation();
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    navigate(event);
  }
  function move(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    if (!(event.buttons & 1)) {
      stop();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    navigate(event);
  }
  function end(event: PointerEvent): void {
    if (event.pointerId === pointer) stop();
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  view?.addEventListener('blur', stop);
  return () => {
    stop();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end);
    canvas.removeEventListener('pointercancel', end);
    canvas.removeEventListener('lostpointercapture', end);
    view?.removeEventListener('blur', stop);
  };
}
